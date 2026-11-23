// Слой данных: Supabase, если он настроен, иначе встроенные данные + localStorage.
import { CONFIG } from "./config.js";
import { PLACES, ROUTES } from "./data.js?v=20261123b";

const LS_KEY = "katyusha:favorites";
const SUPABASE_ESM = "https://esm.sh/@supabase/supabase-js@2";

let sb = null;
let favoritesEnabled = false;
const projectUrl = () => String(CONFIG.SUPABASE_URL).trim().replace(/\\/rest\\/v1\\/?$/, "").replace(/\\/+$/, "");

const readLocal = () => {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
};
const writeLocal = (set) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...set])); } catch {}
};

/** Загружает каталог независимо от таблиц маршрутов и избранного. */
export async function loadData() {
  const local = { places: PLACES, routes: ROUTES, favs: new Set(readLocal()), mode: "local" };
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return local;

  try {
    const { createClient } = await import(SUPABASE_ESM);
    sb = createClient(projectUrl(), CONFIG.SUPABASE_ANON_KEY);

    const { data: remotePlaces, error: placesError } = await sb.from("places").select("*").order("id");
    if (placesError) throw placesError;

    let remoteRoutes = ROUTES;
    const { data: routeData, error: routesError } = await sb.from("routes").select("*").order("id");
    if (!routesError && Array.isArray(routeData) && routeData.length) remoteRoutes = routeData;
    else if (routesError) console.warn("Маршруты Supabase недоступны, используются встроенные:", routesError);

    let favs = new Set(readLocal());
    const { data: remoteFavs, error: favError } = await sb.from("favorites").select("place_id");
    favoritesEnabled = !favError;
    if (favoritesEnabled) favs = new Set((remoteFavs || []).map((x) => Number(x.place_id)));
    else console.info("Таблица favorites не настроена: избранное хранится на этом устройстве.");

    if (!Array.isArray(remotePlaces) || !remotePlaces.length) return local;

    const localById = new Map(PLACES.map((place) => [String(place.id), place]));
    const remoteIds = new Set(remotePlaces.map((place) => String(place.id)));
    const mergedPlaces = remotePlaces.map((remote) => {
      const backup = localById.get(String(remote.id));
      if (!backup) return remote;
      const merged = { ...backup, ...remote };
      ["description", "image", "rating", "region", "city", "address", "price_min", "price_max", "price_unit", "review_count", "opening_hours", "phone", "map_url", "source_urls"].forEach((key) => {
        if (remote[key] == null || (Array.isArray(remote[key]) && !remote[key].length)) merged[key] = backup[key];
      });
      return merged;
    });
    return {
      places: [...mergedPlaces, ...PLACES.filter((place) => !remoteIds.has(String(place.id)))],
      routes: remoteRoutes,
      favs,
      mode: "supabase",
    };
  } catch (e) {
    console.error("Не удалось загрузить каталог Supabase; включена резервная база:", e);
    sb = null;
    favoritesEnabled = false;
    return local;
  }
}

export async function setFavorite(placeId, on, favs) {
  const id = Number(placeId);
  on ? favs.add(id) : favs.delete(id);
  writeLocal(favs);
  if (!sb || !favoritesEnabled) return true;
  const { error } = on
    ? await sb.from("favorites").upsert({ place_id: id }, { onConflict: "place_id" })
    : await sb.from("favorites").delete().eq("place_id", id);
  return !error;
}

export function subscribeFavorites(onChange) {
  if (!sb || !favoritesEnabled) return;
  sb.channel("favorites-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "favorites" }, async () => {
      const { data } = await sb.from("favorites").select("place_id");
      if (data) onChange(new Set(data.map((x) => Number(x.place_id))));
    })
    .subscribe();
}
