// Edge Function: поиск и обновление объектов через OpenStreetMap (Overpass API).
// Секреты берутся из Supabase Secrets: CRON_SECRET; SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY подставляются платформой.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const MAX_PER_BOX = 300; // защита от лимитов и больших запросов

// Направления. region — значение, которое уже используется в таблице places.
const BOXES = [
  { region: "Екатеринбург", city: "Екатеринбург", bbox: [56.74, 60.45, 56.92, 60.80] },
  { region: "Москва", city: "Москва", bbox: [55.60, 37.40, 55.88, 37.85] },
  { region: "Санкт-Петербург", city: "Санкт-Петербург", bbox: [59.82, 30.10, 60.05, 30.55] },
  { region: "Нижний Тагил", city: "Нижний Тагил", bbox: [57.87, 59.90, 57.98, 60.08] },
  { region: "Азербайджан", city: "Баку", bbox: [40.33, 49.75, 40.45, 49.98] },
  { region: "Грузия", city: "Тбилиси", bbox: [41.66, 44.72, 41.80, 44.90] },
  { region: "Грузия", city: "Батуми", bbox: [41.60, 41.58, 41.68, 41.68] },
];
// Допустимые рамки стран для проверки координат (грубая проверка «не в море / не в другой стране»)
const COUNTRY_BOX: Record<string, number[]> = {
  "Азербайджан": [38.3, 44.7, 41.95, 50.5], "Грузия": [41.0, 40.0, 43.6, 46.8], "Россия": [41, 27, 82, 180],
};

// OSM-теги -> slug категорий сайта
function categorize(t: Record<string, string>): string | null {
  const a = t.amenity, s = t.shop, to = t.tourism, l = t.leisure, h = t.historic;
  if (a === "restaurant") return "restaurant"; if (a === "fast_food") return "fastfood";
  if (a === "cafe") return t.cuisine === "coffee_shop" ? "coffee" : "cafe";
  if (s === "bakery" || s === "pastry") return "bakery"; if (a === "bar") return "bar"; if (a === "pub") return "pub";
  if (a === "nightclub") return "nightclub"; if (a === "karaoke_box") return "karaoke"; if (a === "cinema") return "cinema";
  if (a === "arts_centre") return "cultural_space"; if (a === "theatre" || a === "concert_hall") return "theatre"; if (a === "marketplace") return "market";
  if (a === "public_bath" || s === "massage" || l === "sauna") return l === "sauna" ? "bath" : "massage";
  if (l === "bowling_alley") return "bowling"; if (l === "adult_gaming_centre" || l === "amusement_arcade") return "gamecenter";
  if (s === "computer" && false) return null; if (l === "escape_game") return "quest";
  if (l === "swimming_pool" && t.access !== "private") return "pool"; if (l === "water_park") return "aquapark";
  if (s === "mall") return "mall"; if (s === "outlet") return "shop";
  if (to === "museum") return "museum"; if (to === "gallery") return "exhibition"; if (to === "viewpoint") return "viewpoint";
  if (to === "attraction") return "attraction"; if (to === "zoo") return "zoo"; if (to === "hotel" || to === "resort") return "hotel";
  if (l === "park") return "park"; if (l === "garden") return "garden"; if (l === "go_kart" || t.sport === "karting") return "karting";
  if (h === "monument" || h === "memorial") return "monument"; if (h) return "historic";
  if (t.natural === "beach") return "beach"; if (t.natural === "water" && t.name) return "nature";
  return null;
}
const FILTERS = [
  'nwr["amenity"~"^(restaurant|fast_food|cafe|bar|pub|nightclub|karaoke_box|cinema|theatre|concert_hall|arts_centre|marketplace|public_bath)$"]',
  'nwr["shop"~"^(bakery|pastry|mall|outlet|massage)$"]',
  'nwr["tourism"~"^(museum|gallery|viewpoint|attraction|zoo|hotel|resort)$"]',
  'nwr["leisure"~"^(park|garden|bowling_alley|adult_gaming_centre|amusement_arcade|escape_game|water_park|go_kart|sauna)$"]',
  'nwr["historic"~"^(monument|memorial|castle|ruins|building|fort)$"]',
  'nwr["natural"="beach"]',
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, " ").trim();
const hav = (a: number, b: number, c: number, d: number) => {
  const R = 6371000, r = Math.PI / 180, dLa = (c - a) * r, dLo = (d - b) * r;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function overpass(bbox: number[], filter: string) {
  const q = `[out:json][timeout:60];(${filter}(${bbox.join(",")}););out center tags ${MAX_PER_BOX};`;
  const r = await fetch(OVERPASS, { method: "POST", body: "data=" + encodeURIComponent(q),
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "katyusha-walks-sync/1.0 (contact: ВСТАВЬ_СВОЙ_EMAIL)" } });
  if (!r.ok) throw new Error(`Overpass ${r.status}`);
  return (await r.json()).elements as any[];
}

Deno.serve(async (req) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret, apikey" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const url = Deno.env.get("SUPABASE_URL")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, service);

  // Доступ: секрет для cron ИЛИ вошедший администратор
  const cron = Deno.env.get("CRON_SECRET");
  let ok = !!cron && req.headers.get("x-cron-secret") === cron;
  if (!ok) {
    const auth = req.headers.get("authorization") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data } = await userClient.rpc("is_admin"); ok = data === true;
  }
  if (!ok) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const action: string = body.action ?? "discover";
  const { data: src } = await db.from("data_sources").select("id,enabled").eq("name", "osm_overpass").single();
  if (!src?.enabled) return json({ error: "источник отключён" }, 409);

  const { data: log } = await db.from("sync_logs").insert({ source_id: src.id, action }).select("id").single();
  const st = { found: 0, added: 0, updated: 0, dup: 0, err: 0 }; const errors: string[] = [];

  try {
    if (action === "check_coordinates") {
      const { data: places } = await db.from("places").select("id,region,latitude,longitude").limit(5000);
      for (const p of places ?? []) {
        st.found++;
        const box = COUNTRY_BOX[p.region] ?? COUNTRY_BOX["Россия"];
        const bad = p.latitude < box[0] || p.latitude > box[2] || p.longitude < box[1] || p.longitude > box[3];
        if (bad) { st.err++; await db.from("places").update({ status: "needs_review" }).eq("id", p.id);
          await db.from("place_review_queue").insert({ source_id: src.id, candidate: p, matched_place_id: p.id, reason: "координаты вне страны" }); }
      }
    } else {
      const wanted = body.region ? BOXES.filter((b) => b.region === body.region) : BOXES;
      for (const box of wanted) {
        for (const f of FILTERS) {
          let els: any[] = [];
          try { els = await overpass(box.bbox, f); } catch (e) { st.err++; errors.push(`${box.city}: ${e.message}`); await sleep(5000); continue; }
          await sleep(1500); // вежливая пауза между запросами
          const { data: existing } = await db.from("places").select("id,title,latitude,longitude").eq("city", box.city);
          for (const el of els) {
            const t = el.tags ?? {}; const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
            const cat = categorize(t); if (!t.name || !cat || lat == null) continue;
            st.found++; const ext = `${el.type}/${el.id}`;
            const { data: known } = await db.from("place_external_ids").select("place_id").eq("source_id", src.id).eq("external_id", ext).maybeSingle();
            const fields = { title: t.name, category: cat, latitude: lat, longitude: lon, address: [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", ") || null,
              phone: t.phone ?? t["contact:phone"] ?? null, website: t.website ?? t["contact:website"] ?? null, opening_hours: t.opening_hours ?? null,
              coord_source: "OpenStreetMap", last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            if (known) { // обновляем только то, что источник реально отдал
              const patch = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v != null && !["title", "category"].includes(k)));
              await db.from("places").update(patch).eq("id", known.place_id); st.updated++; continue;
            }
            const near = (existing ?? []).filter((p) => hav(lat, lon, p.latitude, p.longitude) < 100);
            const same = near.find((p) => norm(p.title) === norm(t.name));
            if (same) { await db.from("place_external_ids").insert({ place_id: same.id, source_id: src.id, external_id: ext }); st.dup++; continue; }
            if (near.some((p) => norm(p.title).includes(norm(t.name)) || norm(t.name).includes(norm(p.title)))) { // сомнение: на проверку, не сливаем
              await db.from("place_review_queue").insert({ source_id: src.id, candidate: { ...fields, ext }, reason: "похоже на существующий объект" }); st.dup++; continue; }
            const { data: ins, error } = await db.from("places").insert({ ...fields, region: box.region, city: box.city, status: "active",
              source_urls: [`https://www.openstreetmap.org/${ext}`], is_approx: false }).select("id").single();
            if (error) { st.err++; errors.push(error.message); continue; }
            await db.from("place_external_ids").insert({ place_id: ins.id, source_id: src.id, external_id: ext });
            existing?.push({ id: ins.id, title: t.name, latitude: lat, longitude: lon }); st.added++;
          }
        }
      }
    }
  } catch (e) { st.err++; errors.push(String(e)); }

  const status = st.err && !st.found ? "failed" : st.err ? "partial" : "ok";
  await db.from("sync_logs").update({ finished_at: new Date().toISOString(), status, found_count: st.found, added_count: st.added,
    updated_count: st.updated, duplicate_count: st.dup, error_count: st.err, error_details: errors.slice(0, 20).join("\n") || null }).eq("id", log!.id);
  await db.from("data_sources").update({ last_sync_at: new Date().toISOString(), status }).eq("id", src.id);
  return json({ status, ...st, errors: errors.slice(0, 5) });
});
