import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const index = read("../index.html");
const robots = read("../robots.txt");
const sitemap = read("../sitemap.xml");
const ui = read("../assets/js/ui.js");
const app = read("../assets/js/app.js");
const map = read("../assets/js/map.js");
const planner = read("../assets/js/planner.js");
const store = read("../assets/js/store.js");
const errors = [];

const title = (index.split("<title>")[1] || "").split("</title>")[0].trim();
const descriptionLine = index.split("\n").find((line) => line.includes('name="description"')) || "";
const description = (descriptionLine.split('content="')[1] || "").split('"')[0];
const h1Count = index.toLowerCase().split("<h1").length - 1;
const canonicalLine = index.split("\n").find((line) => line.includes('rel="canonical"')) || "";
const canonical = (canonicalLine.split('href="')[1] || "").split('"')[0];
const sitemapUrl = "https://d82874668-source.github.io/katyusha-walks1/sitemap.xml";

if (!title || title.length > 60) errors.push("Title must be 1–60 characters (got " + title.length + ")");
if (!description || description.length > 155) errors.push("Meta description must be 1–155 characters (got " + description.length + ")");
if (h1Count !== 1) errors.push("Expected exactly one H1, got " + h1Count);
if (!index.includes('lang="ru"')) errors.push("Russian document language is missing");
if (!index.includes('name="viewport"')) errors.push("Viewport meta tag is missing");
if (!index.includes('charset="UTF-8"')) errors.push("UTF-8 charset declaration is missing");
if (!canonical.startsWith("https://")) errors.push("HTTPS canonical URL is missing");
if (!index.includes('class="skip-link"') || !index.includes('href="#top"')) errors.push("Keyboard skip link is missing");
if (!index.includes('"@type": "WebApplication"')) errors.push("WebApplication structured data is missing");
if (!robots.includes("Sitemap: " + sitemapUrl)) errors.push("robots.txt does not advertise the sitemap");
if (!sitemap.includes("<loc>" + canonical + "</loc>")) errors.push("Sitemap does not contain the canonical URL");
if (!ui.includes('alt="${esc(p.title)}"')) errors.push("Place image alt text is missing");
if (!app.includes("historyGrid") || !app.includes("recordVisit(p.id)")) errors.push("Recently viewed places feature is missing");
if (app.includes("Синхронизируется между вашими устройствами")) errors.push("Favorites UI claims cross-device sync without authentication");
if (!map.includes("hasExactCoordinates") || !map.includes("approximate: true")) errors.push("Map coordinate safety guards are missing");
if (!planner.includes("hasExactCoordinates")) errors.push("Planner coordinate safety guards are missing");
if (!store.includes("merged.is_approx = Boolean(remote.is_approx) || Boolean(backup.is_approx)")) errors.push("Conservative approximate-coordinate merge is missing");

console.log("Site check: title " + title.length + "/60, description " + description.length + "/155, " + h1Count + " H1.");
if (errors.length) {
  console.error("FAILED: " + errors.length + " issue(s)");
  errors.forEach((error) => console.error(" - " + error));
  process.exitCode = 1;
} else {
  console.log("PASSED: SEO metadata, accessibility entry point, sitemap, personal history and coordinate safeguards.");
}
