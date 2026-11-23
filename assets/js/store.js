// Слой данных: Supabase REST API + резервный локальный каталог.
import { CONFIG } from "./config.js";
import { PLACES, ROUTES } from "./data.js?v=20261123b";

const LS_KEY = "katyusha:favorites";
let lastLoadMode = "local";

const projectUrl = () => String(CONFIG.SUPABASE_URL || "")
  .trim()
  .replace(/\/$/, "");

const readLocal = () => {
  try {
    const value = JSON.parse(localStorage.getItem(LS_KEY));
    return Array.isArray(value) ? value.map(Number) : [];
  } catch {
    return [];
  }
};
const writeLocal = (set) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...set])); } catch {}
};

async function readTable(table, query = "select=*") {
  const base = projectUrl();
  const key = String(CONFIG.SUPABASE_ANON_KEY || "").trim();
  if (!base || !key) throw new Error("Supabase URL или publishable key не настроен");

  const response = await fetch(`${base}/rest/v1/${table}?${query}`, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const body = await response.text();
  if (!response.ok) {
    let detail = body;
    try {
      const parsed = JSON.parse(body);
      detail = parsed.message || parsed.error || body;
    } catch {}
    throw new Error(`Supabase ${table}: HTTP ${response.status}: ${detail}`);
  }
  try {
    const data = JSON.parse(body);
    if (!Array.isArray(data)) throw new Error("Ожидался массив записей");
    return data;
  } catch (error) {
    throw new Error(`Supabase ${table}: некорректный JSON: ${error.message}`);
  }
}

/** Каталог загружается напрямую через REST; сбой избранного не влияет на места. */
export async function loadData() {
  const local = {
    places: PLACES,
    routes: ROUTES,
    favs: new Set(readLocal()),
    mode: "local",
  };

  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return local;

  try {
    const remotePlaces = await readTable("places", "select=*&order=id.asc");
    if (!remotePlaces.length) throw new Error("Supabase вернул пустой каталог places");

    let remoteRoutes = ROUTES;
    try {
      const routes = await readTable("routes", "select=*&order=id.asc");
      if (routes.length) remoteRoutes = routes;
    } catch (error) {
      console.warn("Маршруты Supabase недоступны, используются резервные:", error);
    }

    const localById = new Map(PLACES.map((place) => [String(place.id), place]));
    const remoteIds = new Set(remotePlaces.map((place) => String(place.id)));
    const mergedPlaces = remotePlaces.map((remote) => {
      const backup = localById.get(String(remote.id));
      if (!backup) return remote;
      const merged = { ...backup, ...remote };
      [
        "description", "image", "rating", "region", "city", "address",
        "price_min", "price_max", "price_unit", "review_count",
        "opening_hours", "phone", "map_url", "source_urls",
      ].forEach((key) => {
        if (remote[key] == null || (Array.isArray(remote[key]) && !remote[key].length)) {
          merged[key] = backup[key];
        }
      });
      return merged;
    });

    lastLoadMode = "supabase";
    console.info(`Каталог загружен из Supabase: ${mergedPlaces.length} мест, ${remoteRoutes.length} маршрутов`);
    return {
      places: [...mergedPlaces, ...PLACES.filter((place) => !remoteIds.has(String(place.id)))],
      routes: remoteRoutes,
      favs: new Set(readLocal()),
      mode: "supabase",
    };
  } catch (error) {
    lastLoadMode = "local";
    console.error("Ошибка загрузки каталога из Supabase; используется локальный резерв:", error);
    return local;
  }
}

export async function setFavorite(placeId, on, favs) {
  const id = Number(placeId);
  on ? favs.add(id) : favs.delete(id);
  writeLocal(favs);
  return true;
}

export function subscribeFavorites() {
  // Избранное хранится локально; таблица favorites не входит в обязательный каталог.
}
