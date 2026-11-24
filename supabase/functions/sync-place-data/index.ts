import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const norm = (value: unknown) => String(value ?? "").trim();
const nonEmpty = (value: unknown) => norm(value).length > 0;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const expectedSecret = Deno.env.get("PLACE_SYNC_SECRET") ?? "";
  const suppliedSecret = req.headers.get("x-sync-secret") ?? "";
  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return json({ error: "Unauthorized: configure PLACE_SYNC_SECRET and send x-sync-secret" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Supabase service environment is incomplete" }, 500);

  const restHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  async function rest(path: string, method = "GET", body?: unknown, prefer?: string) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method,
      headers: { ...restHeaders, ...(prefer ? { Prefer: prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Supabase REST ${method} ${path}: ${response.status} ${text.slice(0, 500)}`);
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  }

  const startedAt = new Date().toISOString();
  let runId: number | null = null;
  const dryRun = new URL(req.url).searchParams.get("dry_run") === "true";

  try {
    const links = await rest(
      "place_source_links?select=id,place_id,external_type,external_id,source_url,confidence&provider=eq.openstreetmap&is_active=eq.true&order=place_id.asc",
    ) as Array<Record<string, unknown>>;

    const ids = [...new Set(links.map((x) => Number(x.place_id)).filter(Number.isFinite))];
    const places = ids.length
      ? await rest(`places?select=id,title,address,phone,opening_hours,website&id=in.(${ids.join(",")})`)
      : [];
    const byPlace = new Map((places as Array<Record<string, unknown>>).map((p) => [String(p.id), p]));
    const eligible = links.filter((link) => byPlace.has(String(link.place_id)));

    if (!dryRun) {
      const run = await rest("place_sync_runs", "POST", {
        provider: "openstreetmap",
        status: "running",
        details: { started_at: startedAt, mapped_links: links.length, database_matches: eligible.length },
      }, "return=representation") as Array<{ id: number }>;
      runId = run?.[0]?.id ?? null;
    }

    if (!eligible.length) {
      if (runId !== null) await rest(`place_sync_runs?id=eq.${runId}`, "PATCH", {
        status: "success", finished_at: new Date().toISOString(),
      });
      return json({ ok: true, dry_run: dryRun, mapped_links: links.length, database_matches: 0, message: "No mapped OSM places currently exist in public.places." });
    }

    const idsByType: Record<string, string[]> = { node: [], way: [], relation: [] };
    for (const link of eligible) {
      const type = norm(link.external_type);
      if (idsByType[type]) idsByType[type].push(norm(link.external_id));
    }
    const clauses = Object.entries(idsByType)
      .filter(([, values]) => values.length)
      .map(([type, values]) => `${type}(id:${[...new Set(values)].join(",")});`)
      .join("\n");
    const overpassQuery = `[out:json][timeout:45];(\n${clauses}\n);out center tags;`;

    const endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ];
    let osmPayload: { elements?: Array<Record<string, unknown>> } | null = null;
    let osmError = "";
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "KatyushaWalksPlaceSync/1.0 (catalog metadata refresh)" },
          body: new URLSearchParams({ data: overpassQuery }),
        });
        const raw = await response.text();
        if (!response.ok) throw new Error(`Overpass ${response.status}: ${raw.slice(0, 250)}`);
        osmPayload = JSON.parse(raw);
        break;
      } catch (error) {
        osmError = error instanceof Error ? error.message : String(error);
      }
    }
    if (!osmPayload) throw new Error(`All Overpass endpoints failed: ${osmError}`);

    const elementMap = new Map<string, Record<string, unknown>>();
    for (const element of osmPayload.elements ?? []) {
      elementMap.set(`${element.type}/${element.id}`, element);
    }

    let checked = 0, updated = 0, queued = 0, missing = 0, errors = 0;
    const details: Array<Record<string, unknown>> = [];

    for (const link of eligible) {
      const placeId = Number(link.place_id);
      const place = byPlace.get(String(placeId))!;
      const key = `${link.external_type}/${link.external_id}`;
      const element = elementMap.get(key);
      checked++;
      if (!element) {
        missing++;
        if (!dryRun) await rest(`place_source_links?id=eq.${link.id}`, "PATCH", {
          last_checked_at: new Date().toISOString(),
          last_error: "OSM object not returned (possibly deleted or temporarily unavailable)",
        });
        continue;
      }

      const tags = (element.tags ?? {}) as Record<string, string>;
      const address = nonEmpty(tags["addr:full"])
        ? norm(tags["addr:full"])
        : [
            [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(", "),
            tags["addr:neighbourhood"] || tags["addr:suburb"] || tags["addr:district"],
            tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || norm(place.city),
            tags["addr:postcode"],
            tags["addr:country"],
          ].filter(Boolean).join(", ");
      const discovered: Record<string, string> = {
        address,
        phone: norm(tags["contact:phone"] || tags.phone),
        opening_hours: norm(tags["contact:opening_hours"] || tags.opening_hours),
        website: norm(tags["contact:website"] || tags.website),
      };

      const patch: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(discovered)) {
        if (!value) continue;
        const oldValue = norm(place[field]);
        if (!oldValue) {
          patch[field] = value;
        } else if (oldValue !== value) {
          queued++;
          if (!dryRun) {
            await rest("place_sync_changes", "POST", {
              place_id: placeId,
              provider: "openstreetmap",
              field_name: field,
              old_value: oldValue,
              proposed_value: value,
              confidence: Number(link.confidence ?? 1),
              status: "pending",
            }, "resolution=ignore-duplicates,return=minimal");
          }
        }
      }

      if (Object.keys(patch).length) {
        updated++;
        details.push({ place_id: placeId, fields: Object.keys(patch) });
        if (!dryRun) {
          patch.last_verified_at = new Date().toISOString();
          await rest(`places?id=eq.${placeId}`, "PATCH", patch);
        }
      }
      if (!dryRun) {
        await rest(`place_source_links?id=eq.${link.id}`, "PATCH", {
          last_checked_at: new Date().toISOString(),
          last_error: null,
        });
      }
    }

    const status = errors > 0 ? "partial" : "success";
    if (!dryRun && runId !== null) {
      await rest(`place_sync_runs?id=eq.${runId}`, "PATCH", {
        status,
        places_checked: checked,
        places_updated: updated,
        changes_queued: queued,
        errors: errors + missing,
        details: { mapped_links: links.length, database_matches: eligible.length, missing_osm_objects: missing, updated_fields: details },
        finished_at: new Date().toISOString(),
      });
    }

    return json({
      ok: true,
      dry_run: dryRun,
      mapped_links: links.length,
      database_matches: eligible.length,
      osm_objects_found: elementMap.size,
      places_checked: checked,
      places_with_safe_updates: updated,
      conflicting_values_queued_for_review: queued,
      missing_osm_objects: missing,
      updates: details,
      note: "Only blank address/phone/opening-hours/website fields are filled automatically. Conflicting values are queued for review; ratings and reviews are not sourced from OSM.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!dryRun && runId !== null) {
      try {
        await rest(`place_sync_runs?id=eq.${runId}`, "PATCH", {
          status: "failed", errors: 1, details: { error: message }, finished_at: new Date().toISOString(),
        });
      } catch {}
    }
    return json({ ok: false, error: message }, 500);
  }
});
