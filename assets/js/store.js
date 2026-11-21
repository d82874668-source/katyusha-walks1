import { CONFIG } from "./config.js";
import { PLACES, ROUTES } from "./data.js?v=5";

const SUPABASE_ESM = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
let sb = null;
const projectUrl = () => String(CONFIG.SUPABASE_URL || "").trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");

/** Загружает публичный каталог и маршруты. Встроенные данные остаются резервным источником. */
export async function loadData() {
  const local = { places: PLACES, routes: ROUTES, mode: "local" };
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return local;
  try {
    const { createClient } = await import(SUPABASE_ESM);
    sb = createClient(projectUrl(), CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const [placesResult, routesResult] = await Promise.all([
      sb.from("places").select("*").order("id"),
      sb.from("routes").select("*").order("id"),
    ]);
    const photosResult = await sb.from("place_photos").select("place_id,url,license,attribution,sort_order").order("sort_order").order("id");
    const error = placesResult.error || routesResult.error;
    if (error) throw error;
    if (!Array.isArray(placesResult.data) || !placesResult.data.length) return local;
    const photosByPlace = new Map();
    if (!photosResult.error) {
      for (const photo of photosResult.data || []) {
        const list = photosByPlace.get(photo.place_id) || [];
        list.push(photo);
        photosByPlace.set(photo.place_id, list);
      }
    }
    const localById = new Map(PLACES.map((place) => [String(place.id), place]));
    const remoteIds = new Set(placesResult.data.map((place) => String(place.id)));
    const mergedPlaces = placesResult.data.map((remote) => {
      const localPlace = localById.get(String(remote.id));
      if (!localPlace) return { ...remote, photos: photosByPlace.get(remote.id) || [] };
      const merged = { ...localPlace, ...remote, photos: photosByPlace.get(remote.id) || [] };
      ["description","image","rating","region","city","country","address","price_min","price_max","price_unit","review_count","opening_hours","phone","map_url","website","source_urls"].forEach((key) => {
        const value = remote[key];
        if (value == null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && !value.length)) merged[key] = localPlace[key];
      });
      if (localPlace.last_verified_at && (!remote.last_verified_at || String(localPlace.last_verified_at) > String(remote.last_verified_at))) {
        ["latitude","longitude","address","map_url","is_approx"].forEach((key) => { if (localPlace[key] != null) merged[key] = localPlace[key]; });
        merged.source_urls = [...new Set([...(Array.isArray(remote.source_urls)?remote.source_urls:[]),...(Array.isArray(localPlace.source_urls)?localPlace.source_urls:[])])];
        merged.last_verified_at = localPlace.last_verified_at;
      }
      return merged;
    });
    const allPlaces = [...mergedPlaces, ...PLACES.filter((place) => !remoteIds.has(String(place.id)))];
    // Не публикуем закрытые и ожидающие ручной проверки места, даже если у них есть фото.
    // Карточки без фотографий остаются скрытыми до добавления подтверждённого изображения.
    const publicPlaces = allPlaces.filter((place) =>
      place.status !== "closed" &&
      place.status !== "needs_review" &&
      place.verification_status !== "needs_review" &&
      typeof place.image === "string" &&
      /^https?:\/\//i.test(place.image.trim())
    );
    return {
      places: publicPlaces,
      hiddenIncompleteCount: allPlaces.length - publicPlaces.length,
      routes: Array.isArray(routesResult.data) && routesResult.data.length ? routesResult.data : ROUTES,
      mode: "supabase",
    };
  } catch (error) {
    console.warn("Supabase недоступен, используются встроенные данные:", error);
    sb = null;
    return local;
  }
}
