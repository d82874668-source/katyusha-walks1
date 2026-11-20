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
    const [p, r] = await Promise.all([
      sb.from("places").select("*").order("id"),
      sb.from("routes").select("*").order("id"),
    ]);
    const photoResult = await sb.from("place_photos").select("place_id,url,license,attribution,sort_order").order("sort_order").order("id");
    const photosByPlace = new Map();
    if (!photoResult.error) for (const photo of photoResult.data || []) {
      const list = photosByPlace.get(photo.place_id) || []; list.push(photo); photosByPlace.set(photo.place_id, list);
    }
    const err = p.error || r.error;
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
        if (remote[key] == null || (typeof remote[key] === "string" && !remote[key].trim()) || (Array.isArray(remote[key]) && !remote[key].length)) merged[key] = local[key];
      });
      // Если локальная запись проверена позже, используем более свежий адрес и объединяем источники.
      if (local.last_verified_at && (!remote.last_verified_at || String(local.last_verified_at) > String(remote.last_verified_at))) {
        if (local.address) merged.address = local.address;
        merged.source_urls = [...new Set([...(remote.source_urls || []), ...(local.source_urls || [])])];
        merged.last_verified_at = local.last_verified_at;
      }
      return merged;
    });
    return {
      places: [...mergedPlaces, ...PLACES.filter((place) => !remoteIds.has(String(place.id)))],
      routes: r.data,
      favs: new Set(readLocal()),
      mode: "supabase",
    };
  } catch (e) {
    console.warn("Supabase недоступен, используются встроенные данные:", e);
    sb = null;
    return local;
  }
}

/** Избранное хранится локально: публичный глобальный список больше не используется. */
export async function setFavorite(placeId, on, favs) {
  on ? favs.add(placeId) : favs.delete(placeId);
  writeLocal(favs);
  return true;
}

/** Синхронизация отключена до появления авторизованного пользовательского профиля. */
export function subscribeFavorites() {
  // Intentionally local-only: never expose one visitor's favourites to another.
}
