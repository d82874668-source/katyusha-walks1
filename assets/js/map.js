// Карта (Leaflet + OpenStreetMap), расчёт маршрута (OSRM) и ссылки на навигацию.
import { CATEGORIES } from "./data.js?v=5";

// Точка отсчёта по умолчанию: площадь Фонтанов, Баку.
export const CENTER = { latitude: 40.3725, longitude: 49.8355, label: "площади Фонтанов" };

const icon = (n) => `<svg class="i"><use href="#i-${n}"/></svg>`;

export const fmtDist = (km) => (km < 10 ? km.toFixed(1) : Math.round(km)) + " км";
export const fmtDur = (min) => {
  const m = Math.round(min);
  return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, "0")} мин`;
};

/* ---------- Ссылки на внешние карты ---------- */

// Если координаты приблизительные, Google ищет место по названию: так надёжнее.
const gPoint = (p) => {
  if (!p.is_approx) return `${p.latitude},${p.longitude}`;
  return encodeURIComponent([p.title, p.address, p.city, p.region].filter(Boolean).join(", "));
};

/** Google Maps: origin можно не передавать, тогда начало = текущее местоположение. */
export function googleUrl(dest, origin = null, via = [], mode = "drive") {
  let u = `https://www.google.com/maps/dir/?api=1&destination=${gPoint(dest)}&travelmode=${mode === "walk" ? "walking" : "driving"}`;
  if (origin) u += `&origin=${origin.latitude},${origin.longitude}`;
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
const validPoint = (p) => Number.isFinite(Number(p?.latitude)) && Number.isFinite(Number(p?.longitude)) && Math.abs(Number(p.latitude)) <= 90 && Math.abs(Number(p.longitude)) <= 180;

const imageOfPlace = (p) => p?.image || (Array.isArray(p?.photos) ? p.photos[0]?.url : "") || "";
export class MapView {
  constructor(el, onSelect = () => {}) {
    this.onSelect = onSelect;
    this.markers = new Map();
    this.places = [];
    this.numbered = false;
    this.map = L.map(el, { zoomControl: false, attributionControl: true, scrollWheelZoom: false })
      .setView([40.3725, 49.8355], 12);
    L.control.zoom({ position: "topleft" }).addTo(this.map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);
    // Колесо мыши масштабирует только после клика по карте: страница не «залипает» при скролле.
    this.map.on("focus", () => this.map.scrollWheelZoom.enable());
    this.map.on("blur", () => this.map.scrollWheelZoom.disable());
    this.map.on("zoomend", () => this.renderMarkers());
  }

  setPlaces(places, fit = true, numbered = false) {
    // Неточные координаты не показываем на карте: несколько таких записей
    // раньше накладывались в одной условной точке города.
    this.places = (places || []).filter((p) => validPoint(p) && !p.is_approx);
    this.numbered = numbered;
    this.renderMarkers();
    if (fit) this.fit(this.places);
  }

  // Группируем маркеры по фактическому расстоянию на экране, а не по сеточным ячейкам:
  // так близкие точки не оказываются нарисованы одна поверх другой на границе ячеек.
  renderMarkers() {
    this.markers.forEach((m) => m.remove());
    this.markers.clear();
    const zoom = this.map.getZoom();
    const screenPoints = this.places.map((place) => ({
      place,
      point: this.map.project([Number(place.latitude), Number(place.longitude)], zoom),
    }));
    const groups = [];
    const clusterRadius = 44;

    screenPoints.forEach((item) => {
      // Сравниваем с центром группы, а не с любой её точкой:
      // это не даёт длинным цепочкам маркеров сливаться в один огромный кластер.
      let target = groups.find((group) => {
        const center = group.reduce((sum, member) => ({
          x: sum.x + member.point.x / group.length,
          y: sum.y + member.point.y / group.length,
        }), { x: 0, y: 0 });
        return Math.hypot(item.point.x - center.x, item.point.y - center.y) < clusterRadius;
      });
      if (!target) {
        target = [];
        groups.push(target);
      }
      target.push(item);
    });

    const showPreview = (place, latlng) => {
      const content = document.createElement("div");
      content.className = "pin-preview";
      content.style.cssText = "width:100%;max-width:260px;font-family:inherit;color:#1b1c1a;";
      const photo = imageOfPlace(place);
      if (photo) {
        const img = document.createElement("img");
        img.src = photo;
        img.alt = place.title || "Фотография места";
        img.loading = "lazy";
        img.style.cssText = "display:block;width:100%;height:112px;object-fit:cover;border-radius:10px;margin-bottom:10px;";
        content.append(img);
      }
      const category = document.createElement("div");
      category.textContent = CATEGORIES[place.category]?.title || "Место";
      category.style.cssText = "font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9d4229;margin-bottom:4px;";
      content.append(category);
      const title = document.createElement("strong");
      title.textContent = place.title || "Интересное место";
      title.style.cssText = "display:block;font-size:15px;line-height:1.35;margin-bottom:6px;";
      content.append(title);
      if (place.address) {
        const address = document.createElement("div");
        address.textContent = place.address;
        address.style.cssText = "font-size:12px;line-height:1.4;color:#59615c;margin-bottom:7px;";
        content.append(address);
      }
      if (place.description) {
        const description = document.createElement("p");
        description.textContent = String(place.description).slice(0, 180) + (String(place.description).length > 180 ? "…" : "");
        description.style.cssText = "font-size:12px;line-height:1.45;margin:0;color:#424844;";
        content.append(description);
      }
      L.popup({ maxWidth: 300, minWidth: 210, closeButton: true, autoPan: true })
        .setLatLng(latlng)
        .setContent(content)
        .openOn(this.map);
    };

    groups.forEach((group) => {
      if (group.length > 1) {
        const center = {
          x: group.reduce((sum, item) => sum + item.point.x, 0) / group.length,
          y: group.reduce((sum, item) => sum + item.point.y, 0) / group.length,
        };
        const anchor = group.reduce((best, item) => {
          const distance = Math.hypot(item.point.x - center.x, item.point.y - center.y);
          return !best || distance < best.distance ? { item, distance } : best;
        }, null).item;
        const latlng = [Number(anchor.place.latitude), Number(anchor.place.longitude)];
        const cluster = L.marker(latlng, {
          icon: L.divIcon({
            className: "pin-cluster",
            html: '<span>' + group.length + '</span>',
            iconSize: [44, 44],
            iconAnchor: [22, 22],
          }),
          title: group.length + " мест рядом",
        }).addTo(this.map);
        cluster.on("click", () => {
          // Сначала раскрываем скопление на карте. Если после приближения
          // места всё ещё рядом (один адрес/здание), повторный клик покажет список.
          if (this.map.getZoom() < 18) {
            const bounds = L.latLngBounds(group.map(({ place }) => [
              Number(place.latitude), Number(place.longitude),
            ]));
            if (bounds.isValid() && bounds.getNorthEast().distanceTo(bounds.getSouthWest()) > 12) {
              this.map.fitBounds(bounds, { padding: [56, 56], maxZoom: 18 });
              return;
            }
          }
          const list = document.createElement("div");
          list.className = "pin-cluster-popup";
          const heading = document.createElement("strong");
          heading.textContent = group.length + " мест рядом";
          heading.style.cssText = "display:block;margin-bottom:8px;font-size:14px;";
          list.append(heading);
          group.forEach(({ place }) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = place.title || "Показать место";
            button.style.cssText = "display:block;width:100%;padding:8px 10px;text-align:left;border:0;border-radius:8px;background:#f5f3ef;margin:4px 0;cursor:pointer;font:inherit;";
            button.addEventListener("click", () => showPreview(place, [Number(place.latitude), Number(place.longitude)]));
            list.append(button);
          });
          L.popup({ maxWidth: 290, maxHeight: 320, closeButton: true })
            .setLatLng(latlng)
            .setContent(list)
            .openOn(this.map);
        });
        this.markers.set("cluster-" + group.map((item) => item.place.id).join("-"), cluster);
        return;
      }

      const p = group[0].place;
      const category = CATEGORIES[p.category] || { icon: "pin", hue: 340 };
      const marker = L.marker([p.latitude, p.longitude], {
        title: p.title || "Открыть предпросмотр",
        icon: L.divIcon({
          className: "pin",
          html: '<span class="pin__dot" style="--h:' + category.hue + '">' + (this.numbered ? '<b>' + (this.places.indexOf(p) + 1) + '</b>' : icon(category.icon)) + '</span>',
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        }),
      }).addTo(this.map);
      marker.on("click", () => showPreview(p, [p.latitude, p.longitude]));
      this.markers.set(p.id, marker);
    });
  }
  fit(places) {
    const valid = (places || []).filter(validPoint);
    if (!valid.length) return;
    if (valid.length === 1) {
      this.map.setView([valid[0].latitude, valid[0].longitude], 15);
      return;
    }
    const bounds = L.latLngBounds(valid.map((p) => [p.latitude, p.longitude]));
    this.map.fitBounds(bounds, { padding: [64, 64], maxZoom: 14 });
  }

  focus(p) {
    if (!validPoint(p)) return;
    this.map.flyTo([p.latitude, p.longitude], Math.max(this.map.getZoom(), 16), { duration: 0.8 });
    this.map.once("moveend", () => {
      this.markers.forEach((m) => m.getElement()?.classList.remove("is-active"));
      this.markers.get(p.id)?.getElement()?.classList.add("is-active");
    });
  }

  clearRoute() { this.routeLayer.clearLayers(); }

  /** Рисует маршрут по дорогам; при ошибке OSRM рисует прямую пунктиром. */
  async drawRoute(points, mode = "drive") {
    this.clearRoute();
    let line, info = null;
    const valid = (points || []).filter(validPoint);
    if (valid.length < 2) return null;
    try { info = await route(valid, mode); line = info.line; }
    catch { line = valid.map((p) => [p.latitude, p.longitude]); }
    L.polyline(line, { color: "#9D4229", weight: 5, opacity: 0.9, dashArray: info ? null : "8 8", lineCap: "round" }).addTo(this.routeLayer);
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
          this.me = L.circleMarker([pos.latitude, pos.longitude], { radius: 8, color: "#fff", weight: 3, fillColor: "#1E3A2F", fillOpacity: 1 }).addTo(this.map);
          resolve(pos);
        },
        () => reject(new Error("Нет доступа к геолокации")),
        { enableHighAccuracy: false, timeout: 8000 }
      );
    });
  }

  refresh() { this.map.invalidateSize(); }
}
