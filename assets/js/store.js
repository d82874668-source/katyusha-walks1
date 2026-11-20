// Слой данных: Supabase, если он настроен, иначе встроенные данные + localStorage.
import { CONFIG } from "./config.js";
import { PLACES, ROUTES } from "./data.js";

const LS_KEY = "katyusha:favorites";
const SUPABASE_ESM = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

let sb = null;
// Принимаем и «https://x.supabase.co», и ошибочно скопированный «https://x.supabase.co/rest/v1/»
const projectUrl = () => String(CONFIG.SUPABASE_URL).trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");

const readLocal = () => {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
};
const writeLocal = (set) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...set])); } catch { /* приватный режим */ }
};

/** Загружает места, маршруты и избранное. mode: "supabase" | "local" */
export async function loadData() {
  const local = { places: PLACES, routes: ROUTES, favs: new Set(readLocal()), mode: "local" };
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return local;

  try {
    // SDK подгружается только когда Supabase настроен: так сайт грузится быстрее.
    const { createClient } = await import(SUPABASE_ESM);
    sb = createClient(projectUrl(), CONFIG.SUPABASE_ANON_KEY);
    const [p, r, f] = await Promise.all([
      sb.from("places").select("*").order("id"),
      sb.from("routes").select("*").order("id"),
      sb.from("favorites").select("place_id"),
    ]);
    const photoResult = await sb.from("place_photos").select("place_id,url,license,attribution").order("id");
    const photosByPlace = new Map();
    if (!photoResult.error) for (const photo of photoResult.data || []) {
      const list = photosByPlace.get(photo.place_id) || []; list.push(photo); photosByPlace.set(photo.place_id, list);
    }
    const err = p.error || r.error || f.error;
    if (err) throw err;
    if (!p.data.length) return local; // база пустая: показываем встроенные данные
    // Не теряем новые встроенные записи, пока их не добавили в подключённую Supabase.
    // Существующая запись из базы всегда имеет приоритет над резервной копией с тем же id.
    const localById = new Map(PLACES.map((place) => [String(place.id), place]));
    const remoteIds = new Set(p.data.map((place) => String(place.id)));
    const mergedPlaces = p.data.map((remote) => {
      const local = localById.get(String(remote.id));
      if (!local) return { ...remote, photos: photosByPlace.get(remote.id) || [] };
      const merged = { ...local, ...remote, photos: photosByPlace.get(remote.id) || [] };
      ["description", "image", "rating", "region", "city", "country", "address", "price_min", "price_max", "price_unit", "review_count", "opening_hours", "phone", "map_url", "website", "source_urls"].forEach((key) => {
        if (remote[key] == null || (Array.isArray(remote[key]) && !remote[key].length)) merged[key] = local[key];
      });
      return merged;
    });
    return {
      places: [...mergedPlaces, ...PLACES.filter((place) => !remoteIds.has(String(place.id)))],
      routes: r.data,
      favs: new Set(f.data.map((x) => x.place_id)),
      mode: "supabase",
    };
  } catch (e) {
    console.warn("Supabase недоступен, используются встроенные данные:", e);
    sb = null;
    return local;
  }
}

/** Добавляет/убирает место из избранного. Возвращает true при успехе. */
export async function setFavorite(placeId, on, favs) {
  on ? favs.add(placeId) : favs.delete(placeId);
  writeLocal(favs);
  if (!sb) return true;
  const { error } = on
    ? await sb.from("favorites").upsert({ place_id: placeId }, { onConflict: "place_id" })
    : await sb.from("favorites").delete().eq("place_id", placeId);
  return !error;
}

/** Подписка на изменения избранного с другого устройства (Supabase Realtime). */
export function subscribeFavorites(onChange) {
  if (!sb) return;
  sb.channel("favorites-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "favorites" }, async () => {
      const { data } = await sb.from("favorites").select("place_id");
      if (data) onChange(new Set(data.map((x) => x.place_id)));
    })
    .subscribe();
}
