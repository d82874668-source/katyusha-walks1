// Слой данных: Supabase REST API + резервный локальный каталог.
import { CONFIG } from "./config.js?v=20261124n";
import { PLACES, ROUTES } from "./data.js?v=20261124n";

const LS_KEY = "katyusha:favorites";
let lastLoadMode = "local";

async function readSnapshot() {
  try {
    const url = new URL("../data/catalog.json", import.meta.url);
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Static catalog: HTTP ${response.status}`);
    const snapshot = await response.json();
    if (!Array.isArray(snapshot.places) || !snapshot.places.length) throw new Error("Static catalog is empty");
    return snapshot;
  } catch (error) {
    console.warn("Статический снимок каталога недоступен, используется встроенный резерв:", error);
    return null;
  }
}

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response;
  let body;
  try {
    response = await fetch(`${base}/rest/v1/${table}?${query}`, {
      method: "GET",
      headers: {
        apikey: key,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    // Таймер должен охватывать не только получение заголовков, но и чтение тела.
    // Иначе fetch может вернуть HTTP 200, зависнуть на response.text(), а init()
    // навсегда останется в ожидании и не покажет даже локальный резервный каталог.
    body = await response.text();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Supabase ${table}: превышено время ожидания чтения ответа (12 секунд)`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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

/** Каталог: Supabase как источник истины, статический снимок как полный резерв. */
export async function loadData() {
  const snapshot = await readSnapshot();
  const backupPlaces = snapshot?.places?.length ? snapshot.places : PLACES;
  const backupRoutes = snapshot?.routes?.length ? snapshot.routes : ROUTES;
  const local = {
    places: backupPlaces,
    routes: backupRoutes,
    favs: new Set(readLocal()),
    mode: snapshot ? "snapshot" : "local",
  };

  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
    lastLoadMode = local.mode;
    console.info(`Каталог загружен из резервного источника: ${local.places.length} мест`);
    return local;
  }

  try {
    const remotePlaces = await readTable("places", "select=*&order=id.asc");
    if (!remotePlaces.length) throw new Error("Supabase вернул пустой каталог places");

    let remoteRoutes = backupRoutes;
    try {
      const routes = await readTable("routes", "select=*&order=id.asc");
      if (routes.length) remoteRoutes = routes;
    } catch (error) {
      console.warn("Маршруты Supabase недоступны, используются резервные:", error);
    }

    const backupById = new Map(backupPlaces.map((place) => [String(place.id), place]));
    const remoteIds = new Set(remotePlaces.map((place) => String(place.id)));
    const mergedPlaces = remotePlaces.map((remote) => {
      const backup = backupById.get(String(remote.id));
      if (!backup) return remote;
      const merged = { ...backup, ...remote };
      [
        "description", "image", "rating", "region", "city", "address",
        "price_min", "price_max", "price_unit", "review_count",
        "opening_hours", "phone", "map_url", "source_urls",
        "verification_status", "coord_source", "description_source",
        "country", "website", "subcategory", "features", "additional_services",
        "photo_sources", "avg_check", "official_name", "original_name",
      ].forEach((key) => {
        if (remote[key] == null || (Array.isArray(remote[key]) && !remote[key].length)) {
          merged[key] = backup[key];
        }
      });
      // При конфликте источников выбираем безопасный вариант: если хотя бы один
      // источник считает точку приблизительной, не выдаём её за точный адрес.
      merged.is_approx = Boolean(remote.is_approx) || Boolean(backup.is_approx);
      return merged;
    });

    lastLoadMode = "supabase";
    const allPlaces = [...mergedPlaces, ...backupPlaces.filter((place) => !remoteIds.has(String(place.id)))];
    console.info(`Каталог загружен из Supabase: ${allPlaces.length} мест, ${remoteRoutes.length} маршрутов`);
    return {
      places: allPlaces,
      routes: remoteRoutes,
      favs: new Set(readLocal()),
      mode: "supabase",
    };
  } catch (error) {
    lastLoadMode = local.mode;
    console.error("Ошибка загрузки каталога из Supabase; используется резервный каталог:", error);
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
