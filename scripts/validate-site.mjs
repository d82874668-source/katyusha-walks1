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

const title = index.match(/<title>([\\s\\S]*?)<\\/title>/i)?.[1]?.trim() || "";
const description = index.match(/<meta\\s+name="description"\\s+content="([^"]*)"/i)?.[1] || "";
const h1Count = (index.match(/<h1\\b/gi) || []).length;
const canonical = index.match(/<link\\s+rel="canonical"\\s+href="([^"]+)"/i)?.[1] || "";
const sitemapUrl = "https://d82874668-source.github.io/katyusha-walks1/sitemap.xml";

if (!title || title.length > 60) errors.push(`Title must be 1–60 characters (got ${title.length})`);
if (!description || description.length > 155) errors.push(`Meta description must be 1–155 characters (got ${description.length})`);
if (h1Count !== 1) errors.push(`Expected exactly one H1, got ${h1Count}`);
if (!/<html\\s+lang="ru"/i.test(index)) errors.push("Russian document language is missing");
if (!/<meta\\s+name="viewport"/i.test(index)) errors.push("Viewport meta tag is missing");
if (!/<meta\\s+charset="UTF-8"/i.test(index)) errors.push("UTF-8 charset declaration is missing");
if (!canonical.startsWith("https://")) errors.push("HTTPS canonical URL is missing");
if (!index.includes('class="skip-link"') || !index.includes('href="#top"')) errors.push("Keyboard skip link is missing");
if (!index.includes('"@type": "WebApplication"')) errors.push("WebApplication structured data is missing");
if (!robots.includes(`Sitemap: ${sitemapUrl}`)) errors.push("robots.txt does not advertise the sitemap");
if (!sitemap.includes(`<loc>${canonical}</loc>`)) errors.push("Sitemap does not contain the canonical URL");
if (!/alt="\\$\\{esc\\(p\\.title\\)\\}"/.test(ui)) errors.push("Place image alt text is missing");
if (!app.includes("historyGrid") || !app.includes("recordVisit(p.id)")) errors.push("Recently viewed places feature is missing");
if (app.includes("Синхронизируется между вашими устройствами")) errors.push("Favorites UI claims cross-device sync without authentication");
if (!map.includes("hasExactCoordinates") || !map.includes("approximate: true")) errors.push("Map coordinate safety guards are missing");
if (!planner.includes("hasExactCoordinates")) errors.push("Planner coordinate safety guards are missing");
if (!store.includes("merged.is_approx = Boolean(remote.is_approx) || Boolean(backup.is_approx)")) errors.push("Conservative approximate-coordinate merge is missing");

console.log(`Site check: title ${title.length}/60, description ${description.length}/155, ${h1Count} H1.`);
if (errors.length) {
  console.error(`FAILED: ${errors.length} issue(s)`);
  errors.forEach((error) => console.error(" - " + error));
  process.exitCode = 1;
} else {
  console.log("PASSED: SEO metadata, accessibility entry point, sitemap, personal history and coordinate safeguards.");
}
