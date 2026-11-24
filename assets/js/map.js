// Карта (Leaflet + OpenStreetMap), расчёт маршрута (OSRM) и ссылки на навигацию.
import { CATEGORIES } from "./data.js?v=20261124n";

// Точка отсчёта по умолчанию: площадь Фонтанов, Баку.
export const CENTER = { latitude: 40.3725, longitude: 49.8355, label: "площади Фонтанов" };

const icon = (n) => `<svg class="i"><use href="#i-${n}"/></svg>`;

// Не считаем null/пустую строку координатой 0,0: это частая причина ложных маркеров.
export const hasExactCoordinates = (p) => {
  if (!p || p.latitude == null || p.longitude == null || String(p.latitude).trim() === "" || String(p.longitude).trim() === "") return false;
  const lat = Number(p.latitude), lon = Number(p.longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
};

export const fmtDist = (km) => (km < 10 ? km.toFixed(1) : Math.round(km)) + " км";
export const fmtDur = (min) => {
  const m = Math.round(min);
  return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, "0")} мин`;
};

/* ---------- Ссылки на внешние карты ---------- */

// Если координаты приблизительные, Google ищет место по названию: так надёжнее.
const gPoint = (p) => {
  if (!p.is_approx && hasExactCoordinates(p)) return `${p.latitude},${p.longitude}`;
  return encodeURIComponent([p.title, p.address, p.city, p.region].filter(Boolean).join(", "));
};

/** Google Maps: origin можно не передавать, тогда начало = текущее местоположение. */
export function googleUrl(dest, origin = null, via = [], mode = "drive") {
  let u = `https://www.google.com/maps/dir/?api=1&destination=${gPoint(dest)}&travelmode=${mode === "walk" ? "walking" : "driving"}`;
  if (origin) u += `&origin=${gPoint(origin)}`;
  if (via.length) u += `&waypoints=${via.map(gPoint).join("%7C")}`;
  return u;
}

/** OpenStreetMap (движок OSRM). Принимает любое число точек. */
export function osmUrl(points, mode = "drive") {
  const r = points.map((p) => `${p.latitude}%2C${p.longitude}`).join("%3B");
  return `https://www.openstreetmap.org/directions?engine=${mode === "walk" ? "fossgis_osrm_foot" : "fossgis_osrm_car"}&route=${r}`;
}

/* ---------- Маршрутизация OSRM ---------- */
// Авто: публичный демо-сервер OSRM. Пешком: сервер FOSSGIS с пешеходным профилем.
const OSRM = {
  drive: "https://router.project-osrm.org/route/v1/driving/",
  walk: "https://routing.openstreetmap.de/routed-foot/route/v1/foot/",
};
const cache = new Map();
export async function route(points, mode = "drive") {
  if (points.some((p) => p.is_approx || !hasExactCoordinates(p))) throw new Error("Нельзя строить точный маршрут: у одного или нескольких мест уточняются координаты");
  const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(";");
  const key = mode + "|" + coords;
  if (cache.has(key)) return cache.get(key);
  const res = await fetch(`${OSRM[mode] || OSRM.drive}${coords}?overview=simplified&geometries=geojson`);
  if (!res.ok) throw new Error("OSRM " + res.status);
  const r = (await res.json()).routes?.[0];
  if (!r) throw new Error("Маршрут не найден");
  const out = {
    km: r.distance / 1000, min: r.duration / 60, line: r.geometry.coordinates.map(([x, y]) => [y, x]),
    legs: (r.legs || []).map((l) => ({ km: l.distance / 1000, min: l.duration / 60 })), exact: true,
  };
  cache.set(key, out);
  return out;
}

/* ---------- Оценка без сети (запасной вариант) ---------- */
export const haversineKm = (a, b) => {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
/** Оценка участка: прямая × 1.3 (извилистость улиц); пешком 4.5 км/ч, на авто 30 км/ч в городе и 60 км/ч за городом. */
export function estimateLeg(a, b, mode = "drive") {
  const km = haversineKm(a, b) * 1.3;
  const speed = mode === "walk" ? 4.5 : km > 25 ? 60 : 30;
  return { km, min: (km / speed) * 60, exact: false };
}

/* ---------- Карта ---------- */
export class MapView {
  constructor(el, onSelect = () => {}) {
    this.onSelect = onSelect;
    this.markers = new Map();
    this.map = L.map(el, { zoomControl: false, attributionControl: true, scrollWheelZoom: false })
      .setView([40.4, 49.87], 10);
    L.control.zoom({ position: "topleft" }).addTo(this.map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);
    this.emptyNotice = null;
    this.dismissedNoticeSignature = null;
    // Колесо мыши масштабирует только после клика по карте: страница не «залипает» при скролле.
    this.map.on("focus", () => this.map.scrollWheelZoom.enable());
    this.map.on("blur", () => this.map.scrollWheelZoom.disable());
  }

  setPlaces(places, fit = true, numbered = false) {
    this.markers.forEach((m) => m.remove());
    this.markers.clear();
    // Приблизительные точки (обычно центр города) не ставим на карту:
    // это лучше, чем отправлять человека к заведомо неверному адресу.
    const exactPlaces = places.filter((p) =>
      !p.is_approx && hasExactCoordinates(p)
    );
    const approximatePlaces = places.filter((p) => p.is_approx || !hasExactCoordinates(p));
    const approximateCount = approximatePlaces.length;
    const noticeSignature = approximatePlaces.map((p) => String(p.id)).sort().join("|");
    if (approximateCount > 0) {
      if (this.dismissedNoticeSignature !== noticeSignature) {
        if (!this.emptyNotice) {
          this.emptyNotice = document.createElement("div");
          this.emptyNotice.className = "map-empty";
          this.emptyNotice.setAttribute("role", "status");
          const message = document.createElement("span");
          message.className = "map-empty__text";
          const close = document.createElement("button");
          close.className = "map-empty__close";
          close.type = "button";
          close.setAttribute("aria-label", "Закрыть предупреждение");
          close.textContent = "×";
          close.addEventListener("click", () => {
            this.dismissedNoticeSignature = this.emptyNotice?.dataset.signature || noticeSignature;
            this.emptyNotice?.remove();
            this.emptyNotice = null;
          });
          this.emptyNotice.append(message, close);
          this.map.getContainer().append(this.emptyNotice);
        }
        this.emptyNotice.dataset.signature = noticeSignature;
        const message = this.emptyNotice.querySelector(".map-empty__text");
        if (message) message.textContent = exactPlaces.length
          ? `На карте ${exactPlaces.length} точных точек. Ещё ${approximateCount} мест без подтверждённых координат — они доступны в списке.`
          : `У ${approximateCount} выбранных мест координаты ещё уточняются. Они доступны в списке.`;
      } else if (this.emptyNotice) {
        this.emptyNotice.remove();
        this.emptyNotice = null;
      }
    } else {
      if (this.emptyNotice) this.emptyNotice.remove();
      this.emptyNotice = null;
      this.dismissedNoticeSignature = null;
    }
    exactPlaces.forEach((p, idx) => {
      const c = CATEGORIES[p.category] || { icon: "pin", hue: 340 };
      const m = L.marker([p.latitude, p.longitude], {
        title: p.title,
        icon: L.divIcon({
          className: "pin",
          html: `<span class="pin__dot${p.is_approx ? " is-approx" : ""}" style="--h:${c.hue}">${numbered ? `<b>${idx + 1}</b>` : icon(c.icon)}</span>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        }),
      }).addTo(this.map);
      m.on("click", () => this.onSelect(p.id));
      this.markers.set(p.id, m);
    });
    if (fit) this.fit(exactPlaces);
  }

  fit(places) {
    if (!places.length) return;
    const b = L.latLngBounds(places.map((p) => [p.latitude, p.longitude]));
    this.map.fitBounds(b, { padding: [60, 60], maxZoom: 13 });
  }

  focus(p) {
    if (p.is_approx || !hasExactCoordinates(p)) {
      const note = document.createElement("div");
      note.textContent = "Точная точка этого места ещё уточняется. Найдите его по названию через Google Maps.";
      L.popup().setLatLng(this.map.getCenter()).setContent(note).openOn(this.map);
      return;
    }
    this.markers.forEach((m) => m.getElement()?.classList.remove("is-active"));
    this.markers.get(p.id)?.getElement()?.classList.add("is-active");
    this.map.flyTo([p.latitude, p.longitude], Math.max(this.map.getZoom(), 13), { duration: 0.8 });
  }

  clearRoute() { this.routeLayer.clearLayers(); }

  /** Рисует маршрут по дорогам; при ошибке OSRM рисует прямую пунктиром. */
  async drawRoute(points, mode = "drive") {
    this.clearRoute();
    // Не рисуем вымышленную линию через центры городов и пустые координаты.
    if (points.some((p) => p.is_approx || !hasExactCoordinates(p))) {
      const exactPoints = points.filter((p) => !p.is_approx && hasExactCoordinates(p));
      if (exactPoints.length) this.fit(exactPoints);
      return { approximate: true, exactStops: exactPoints.length, totalStops: points.length };
    }
    let line, info = null;
    try { info = await route(points, mode); line = info.line; }
    catch { line = points.map((p) => [p.latitude, p.longitude]); }
    L.polyline(line, { color: "#D8365C", weight: 5, opacity: 0.9, dashArray: info ? null : "8 8", lineCap: "round" }).addTo(this.routeLayer);
    this.map.fitBounds(L.latLngBounds(line), { padding: [70, 70] });
    return info;
  }

  /** Определяет местоположение пользователя (только по нажатию кнопки). */
  locate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Геолокация недоступна"));
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const pos = { latitude: coords.latitude, longitude: coords.longitude };
          if (this.me) this.me.remove();
          this.me = L.circleMarker([pos.latitude, pos.longitude], { radius: 8, color: "#fff", weight: 3, fillColor: "#1E4FA3", fillOpacity: 1 }).addTo(this.map);
          resolve(pos);
        },
        () => reject(new Error("Нет доступа к геолокации")),
        { enableHighAccuracy: false, timeout: 8000 }
      );
    });
  }

  refresh() { this.map.invalidateSize(); }
}
