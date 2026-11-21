from __future__ import annotations

import json
import re
import subprocess
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        ERRORS.append(message)


class PageAudit(HTMLParser):
    def __init__(self, page: Path):
        super().__init__(convert_charrefs=True)
        self.page = page
        self.images_without_alt = 0
        self.local_refs: list[str] = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag.lower() == "img" and "alt" not in values:
            self.images_without_alt += 1
        for key in ("href", "src"):
            value = values.get(key)
            if not value:
                continue
            value = value.strip()
            if value.startswith(("#", "//", "data:", "mailto:", "tel:", "javascript:")):
                continue
            parsed = urlsplit(value)
            if parsed.scheme or parsed.netloc:
                continue
            if parsed.path:
                self.local_refs.append(parsed.path)


# Canonical source and generated browser catalogue.
source = json.loads((ROOT / "tools/verified_places.json").read_text(encoding="utf-8"))
data_js = (ROOT / "assets/js/data.js").read_text(encoding="utf-8")
places_start = data_js.find("export const PLACES = ") + len("export const PLACES = ")
routes_start = data_js.find(";\nexport const ROUTES", places_start)
check(places_start >= len("export const PLACES = "), "PLACES export missing")
check(routes_start > places_start, "Could not locate end of PLACES array")
places = json.loads(data_js[places_start:routes_start]) if routes_start > places_start else []

def parse_places(text: str):
    start = text.find("export const PLACES = ") + len("export const PLACES = ")
    end = text.find(";\\nexport const ROUTES", start)
    if start < len("export const PLACES = ") or end <= start:
        raise ValueError("Invalid committed data.js")
    return json.loads(text[start:end])


committed_data = subprocess.check_output(["git", "show", "HEAD:assets/js/data.js"], text=True, encoding="utf-8")
committed_places = parse_places(committed_data)
check(committed_places == places, "Committed data.js differs from canonical generator output")
committed_seed = subprocess.check_output(["git", "show", "HEAD:supabase/seed.sql"], text=True, encoding="utf-8")

ids = [int(p["id"]) for p in places]
check(len(ids) == len(set(ids)), "Duplicate place IDs")
check(len(places) >= 130, f"Catalogue unexpectedly small: {len(places)}")
check(not [p for p in places if not p.get("image")], "At least one catalogue card has no image")
check(not [p for p in places if not (-90 <= float(p["latitude"]) <= 90 and -180 <= float(p["longitude"]) <= 180)], "Invalid coordinates found")
keys = [(p["title"].strip().casefold(), p["city"].strip().casefold()) for p in places]
check(len(keys) == len(set(keys)), "Duplicate place title/city pair")

source_ids = [int(p["id"]) for p in source if p.get("id") is not None]
check(len(source_ids) == len(source), "Every source record must have a stable ID")
check(len(source_ids) == len(set(source_ids)), "Duplicate IDs in verified_places.json")
check(all(p.get("image_url") for p in source), "A source catalogue record has no image_url")
check(set(source_ids).issubset(set(ids)), "Source records are missing from browser catalogue")

added = [p for p in places if 990150 <= int(p["id"]) <= 990173]
check(len(added) == 24, f"Expected 24 new verified places, got {len(added)}")
check(all(p.get("image") and p.get("address") and not p.get("is_approx") for p in added), "New landmarks/malls must have photos, addresses and verified coordinates")
check(any(p.get("category") == "attraction" for p in places), "Attractions category missing")
check(any(p.get("category") == "mall" for p in places), "Shopping mall category missing")

# Check that the public map does not display approximate pins.
map_js = (ROOT / "assets/js/map.js").read_text(encoding="utf-8")
check("!p.is_approx" in map_js, "Map must filter approximate coordinates")

# Active pages: metadata, image alternatives and local links.
page_names = ["index.html", "catalog.html", "map.html", "planner.html", "routes.html", "place.html", "admin.html", "404.html"]
for name in page_names:
    page = ROOT / name
    check(page.exists(), f"Missing page: {name}")
    if not page.exists():
        continue
    content = page.read_text(encoding="utf-8")
    check('name="viewport"' in content or "name='viewport'" in content, f"{name}: viewport meta missing")
    parser = PageAudit(page)
    parser.feed(content)
    check(parser.images_without_alt == 0, f"{name}: {parser.images_without_alt} img tags missing alt")
    for ref in parser.local_refs:
        if ref.startswith("/"):
            continue
        target = (page.parent / ref).resolve()
        if target.is_dir():
            target = target / "index.html"
        check(target.exists(), f"{name}: broken local reference {ref}")

# No retired collection/visit UI or module references in the active frontend.
active_files = [ROOT / name for name in page_names]
active_files += list((ROOT / "assets/js").glob("*.js"))
active_files += list((ROOT / "assets/css").glob("*.css"))
active_files += [ROOT / "sw.js"]
for path in active_files:
    if not path.exists():
        continue
    content = path.read_text(encoding="utf-8", errors="replace")
    check(not re.search(r"Моя коллекция|favorites\.html|data-visit|visits\.js|visitDialog|hydrateVisits|saved__|state\.saved|>favorite</span>", content, re.I), f"Retired collection feature reference remains in {path.relative_to(ROOT)}")

check(not (ROOT / "assets/js/visits.js").exists(), "Retired visits module still exists")
check(not (ROOT / "favorites.html").exists(), "Retired collection page still exists")

# Responsive and PWA safeguards.
css = (ROOT / "assets/css/stitch-app.css").read_text(encoding="utf-8")
check("@media(max-width:767px)" in css, "Mobile breakpoint missing")
check("overflow-x:clip" in css or "overflow-x:hidden" in css, "Horizontal overflow safeguard missing")
check("44px" in css, "Minimum mobile touch target rule missing")
sw = (ROOT / "sw.js").read_text(encoding="utf-8")
check("katyusha-pwa-v13" in sw, "PWA cache version not bumped")
check("visits.js" not in sw, "PWA still precaches retired visits module")

seed = committed_seed
check(all(str(i) in seed for i in range(990150, 990174)), "Committed Supabase seed is missing one or more new catalogue IDs")
check(all(p["image"] in seed for p in places if p.get("image")), "Committed Supabase seed is missing one or more place images")

if ERRORS:
    for error in ERRORS:
        print("ERROR:", error)
    raise SystemExit(1)

print(f"QA OK: {len(places)} places, {len(source)} source records, {len(added)} new landmarks/malls, {sum(bool(p.get('is_approx')) for p in places)} approximate locations.")
