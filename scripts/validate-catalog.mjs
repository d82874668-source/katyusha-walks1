import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const snapshot = JSON.parse(read("../assets/data/catalog.json"));
const dataSource = read("../assets/js/data.js");
const mapSource = read("../assets/js/map.js");
const storeSource = read("../assets/js/store.js");
const errors = [];
const places = snapshot.places || [];
const routes = snapshot.routes || [];
const categoryBlock = dataSource.match(/export const CATEGORIES = \{([\s\S]*?)\n\};/);
const categories = new Set(
  [...(categoryBlock?.[1] || "").matchAll(/^\s*"([^"]+)"\s*:/gm)].map((m) => m[1])
);
const ids = new Set();
const names = new Set();

if (places.length < 250) errors.push(`Too few places in snapshot: ${places.length}`);
if (!routes.length) errors.push("No routes in snapshot");
if (!categoryBlock) errors.push("CATEGORIES object not found");

for (const place of places) {
  const id = String(place.id);
  if (!id || id === "undefined" || ids.has(id)) errors.push(`Duplicate or missing place id: ${id}`);
  ids.add(id);

  if (!String(place.title || "").trim()) errors.push(`Place ${id} has no title`);
  if (!categories.has(place.category)) errors.push(`Place ${id} uses unknown category: ${place.category}`);
  const hasRawCoordinates = place.latitude != null && place.longitude != null && String(place.latitude).trim() !== "" && String(place.longitude).trim() !== "";
  const latitude = Number(place.latitude), longitude = Number(place.longitude);
  if (!hasRawCoordinates || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    errors.push(`Place ${id} has invalid or missing coordinates`);
  }
  if (place.image && !/^https?:\/\//i.test(place.image) && !/^(?:\.\/|\/|assets\/)/i.test(place.image)) errors.push(`Place ${id} has invalid image URL`);
  if ((!place.address || !String(place.address).trim()) && !place.is_approx) {
    errors.push(`Place ${id} has no address but is marked as exact`);
  }

  const key = `${String(place.city || "").trim().toLocaleLowerCase("ru")}|${String(place.title || "").trim().toLocaleLowerCase("ru")}`;
  if (names.has(key)) errors.push(`Duplicate title in city: ${place.city} / ${place.title}`);
  names.add(key);
}

const routeIds = new Set();
for (const route of routes) {
  const id = String(route.id);
  if (!id || id === "undefined" || routeIds.has(id)) errors.push(`Duplicate or missing route id: ${id}`);
  routeIds.add(id);
  if (!String(route.title || "").trim()) errors.push(`Route ${id} has no title`);
  if (!Array.isArray(route.places) || route.places.length < 2) errors.push(`Route ${id} has fewer than two stops`);
  else for (const placeId of route.places) {
    if (!ids.has(String(placeId))) errors.push(`Route ${id} references missing place: ${placeId}`);
  }
}

if (!mapSource.includes("!p.is_approx")) errors.push("Map does not filter approximate coordinates");
if (!mapSource.includes("p.is_approx")) errors.push("Approximate-coordinate guard missing in map module");
if (!mapSource.includes("hasExactCoordinates")) errors.push("Strict coordinate validation missing in map module");
if (!mapSource.includes("approximate: true")) errors.push("Approximate route guard missing in map module");
if (!storeSource.includes("readSnapshot")) errors.push("Static catalog fallback missing");

const missingImages = places.filter((p) => !p.image).length;
const missingAddresses = places.filter((p) => !p.address || !String(p.address).trim()).length;
const approximate = places.filter((p) => p.is_approx).length;

console.log(`Catalog check: ${places.length} places, ${new Set(places.map((p) => p.city)).size} cities, ${routes.length} routes.`);
console.log(`Quality flags: ${missingImages} without image, ${missingAddresses} without address, ${approximate} approximate points.`);

if (errors.length) {
  console.error(`FAILED: ${errors.length} issue(s)`);
  for (const error of errors) console.error(" - " + error);
  process.exitCode = 1;
} else {
  console.log("PASSED: unique IDs and city/title pairs, valid categories, coordinates and safe map fallback.");
}
