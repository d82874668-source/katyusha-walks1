// Точка входа: рендер секций, навигация, взаимодействие с картой.
import { CATEGORIES, PLACES, ROUTES } from "./data.js?v=20261124n";
import { loadData, setFavorite, subscribeFavorites } from "./store.js?v=20261124n";
import { MapView, CENTER, googleUrl, osmUrl, route, fmtDist, fmtDur } from "./map.js?v=20261124p";
import { state, byId } from "./state.js?v=20261124r";
import { $, $$, icon, esc, telUrl, cat, priceText, placeCard, toast, cover, hydratePhotos } from "./ui.js?v=20261124n";
import { kindOf, groupOf, VENUE_GROUPS } from "./taxonomy.js?v=20261124n";
import { initPlanner, addToPlan, renderPlanner } from "./planner.js?v=20261124t";
import { initIdeal, refreshIdeal } from "./ideal.js?v=20261124t";

const categoryAliases = { gaming: ["ПК-клубы", "PC-клубы", "игровые компьютерные клубы"], gaming247: ["круглосуточные компьютерные клубы", "24/7"] };
const cityOrigin = (place) => {
  if (!place.city) return CENTER;
  const sameCity = state.places.filter((p) => p.city === place.city && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)));
  if (!sameCity.length) return CENTER;
  return {
    latitude: sameCity.reduce((sum, p) => sum + Number(p.latitude), 0) / sameCity.length,
    longitude: sameCity.reduce((sum, p) => sum + Number(p.longitude), 0) / sameCity.length,
    label: place.city || CENTER.label,
  };
};

let mapView = null;
let mapResizeObserver = null;
// Карта создаётся лениво и пересчитывает размеры при изменении ширины экрана/контейнера.
const ensureMap = () => {
  if (!mapView) {
    mapView = new MapView($("#mapCanvas"), (id) => openPlace(id));
    mapView.setPlaces(visible());
    if ("ResizeObserver" in window) {
      mapResizeObserver = new ResizeObserver(() => requestAnimationFrame(() => mapView?.refresh()));
      mapResizeObserver.observe($("#map"));
    } else {
      addEventListener("resize", () => mapView?.refresh(), { passive: true });
    }
  }
  return mapView;
};

/* ---------- Тема ---------- */
const themeBtn = $("#themeBtn");
const THEMES = {
  light:  { name: "Светлая", note: "Тёплая редакционная палитра", bg: "#F4F1E9", s: "#FFFEFA", i: "#26342E", l: "rgba(38,52,46,.14)", a: "#B85F45", ai: "#FFFAF5", meta: "#F4F1E9" },
  dark:   { name: "Тёмная", note: "Комфортно вечером", bg: "#111A17", s: "#19241F", i: "#F1F0E8", l: "rgba(241,240,232,.18)", a: "#D98565", ai: "#21140F", meta: "#111A17" },
  hearts: { name: "Сердечки", note: "Нежный розовый фон", bg: "#FBF2F0", s: "#FFFCFA", i: "#3A2929", l: "rgba(91,55,49,.18)", a: "#B85F62", ai: "#FFFFFF", meta: "#FBF2F0" },
};
const applyTheme = (t) => {
  if (!THEMES[t]) t = "light";
  document.documentElement.dataset.theme = t;
  themeBtn.innerHTML = icon(t === "dark" ? "sun" : t === "hearts" ? "heart" : "moon");
  themeBtn.setAttribute("aria-label", `Тема оформления: ${THEMES[t].name}. Выбрать тему`);
  themeBtn.title = `Тема оформления: ${THEMES[t].name}`;
  $('meta[name="theme-color"]').content = THEMES[t].meta;
  document.dispatchEvent(new CustomEvent("themechange", { detail: t }));
};
const themeDlg = $("#themeDlg");
let pendingTheme = null;
const renderThemeGrid = () => {
  $("#themeGrid").innerHTML = Object.entries(THEMES).map(([k, v]) => `
    <button type="button" class="themeOpt" role="radio" aria-checked="${k === pendingTheme}" data-theme-pick="${k}">
      <div class="pv" style="background:${v.bg};--pl:${v.l};--ps:${v.s};--pi:${v.i};--pa:${v.a};--pai:${v.ai}">
        <div class="pv__card">Карточка места<em>Текст и подпись</em></div>
        <div class="pv__row"><span class="pv__btn">Кнопка</span><span class="pv__win">Окно</span></div>
      </div>
      <strong>${v.name}</strong><small>${v.note}</small></button>`).join("");
};
const closeThemeDlg = () => { themeDlg.close(); applyTheme(localStorage.getItem("katyusha:theme") || "light"); };
themeBtn.addEventListener("click", () => {
  pendingTheme = document.documentElement.dataset.theme;
  renderThemeGrid(); themeDlg.showModal();
});
$("#themeGrid").addEventListener("click", (e) => {
  const b = e.target.closest("[data-theme-pick]"); if (!b) return;
  pendingTheme = b.dataset.themePick; renderThemeGrid(); applyTheme(pendingTheme); // живой предпросмотр
});
$("#themeApply").addEventListener("click", () => {
  try { localStorage.setItem("katyusha:theme", pendingTheme); } catch {}
  applyTheme(pendingTheme); themeDlg.close();
});
$("#themeCancel").addEventListener("click", closeThemeDlg);
$("#themeClose").addEventListener("click", closeThemeDlg);
themeDlg.addEventListener("cancel", (e) => { e.preventDefault(); closeThemeDlg(); });
applyTheme(document.documentElement.dataset.theme);

/* ---------- Дополнительный каталог аквапарков ---------- */
const waterparksSection = $("#waterparks");
const openWaterparksLink = $('[data-open-waterparks]');
openWaterparksLink?.addEventListener("click", (e) => {
  e.preventDefault();
  waterparksSection.hidden = false;
  history.replaceState(null, "", "#waterparks");
  waterparksSection.scrollIntoView({ behavior: "smooth", block: "start" });
  setMenu(false);
});

/* ---------- Навигация ---------- */
const nav = $("#nav");
const setMenu = (open) => {
  nav.dataset.open = open;
  $("#menuBtn").setAttribute("aria-expanded", open);
  $("#menuBtn").innerHTML = icon(open ? "x" : "menu");
  document.body.classList.toggle("menu-open", open);
};
$("#menuBtn").addEventListener("click", () => setMenu(nav.dataset.open !== "true"));
$$("#menu a").forEach((a) => a.addEventListener("click", () => setMenu(false)));

/* Компактная навигация по разделам: контент раскрывается только по запросу. */
function initCompactSections() {
  const sections = [...document.querySelectorAll("main > section.sec")];
  const update = (section, open) => {
    section.classList.toggle("is-expanded", open);
    const toggle = section.querySelector(".section-toggle");
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.querySelector("span").textContent = open ? "Свернуть" : "Открыть раздел";
    }
  };
  sections.forEach((section) => {
    const head = section.querySelector(":scope > .wrap > .sec__head");
    if (!head || section.id === "about") return;
    section.dataset.collapsible = "true";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "section-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = "<span>Открыть раздел</span><b aria-hidden=\"true\">⌄</b>";
    toggle.addEventListener("click", () => update(section, !section.classList.contains("is-expanded")));
    head.append(toggle);
    update(section, false);
  });
  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const target = document.getElementById(link.getAttribute("href").slice(1));
    if (target?.dataset.collapsible === "true") update(target, true);
  });
}
// Разделы открыты сразу: посетитель видит содержимое и может прокручивать страницу естественно.

addEventListener("keydown", (e) => e.key === "Escape" && setMenu(false));
addEventListener("scroll", () => nav.classList.toggle("is-scrolled", scrollY > 8), { passive: true });

// Подсветка активного раздела
const links = new Map($$("#menu a").map((a) => [a.getAttribute("href").slice(1), a]));
const spy = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    links.forEach((a) => a.removeAttribute("aria-current"));
    links.get(e.target.id)?.setAttribute("aria-current", "true");
  });
}, { rootMargin: "-45% 0px -50% 0px" });
links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });

/* ---------- Избранное ---------- */
async function toggleFav(id) {
  const on = !state.favs.has(id);
  const ok = await setFavorite(id, on, state.favs);
  if (!ok) toast("Не удалось синхронизировать, сохранено на этом устройстве");
  else toast(on ? "Добавлено в избранное" : "Убрано из избранного");
  renderFavs(); renderList(); renderSheet(); renderDiscover(); renderVenues(); renderAquaparks(); refreshIdeal();
}
const favBtn = (p, cls = "") => {
  const on = state.favs.has(p.id);
  return `<button class="icon-btn ${cls} ${on ? "is-fav" : ""}" data-fav="${p.id}" aria-pressed="${on}" aria-label="${on ? "Убрать из избранного" : "В избранное"}">${icon("heart")}</button>`;
};

/* ---------- Карта: фильтры и список ---------- */
const visible = () => {
  const q = state.q.trim().toLocaleLowerCase("ru");
  const list = state.places.filter((p) => {
    const category = CATEGORIES[p.category]?.title || p.category || "";
    const haystack = [p.title, p.address, p.city, p.region, p.description, category, ...(categoryAliases[p.category] || [])].filter(Boolean).join(" ").toLocaleLowerCase("ru");
    const rating = p.rating == null ? null : Number(p.rating);
    const priceMin = p.price_min == null ? null : Number(p.price_min);
    const priceMax = p.price_max == null ? null : Number(p.price_max);
    const hasPrice = priceMin != null && priceMax != null && Number.isFinite(priceMin) && Number.isFinite(priceMax);
    return (state.filter === "all" || p.category === state.filter) &&
      (state.region === "all" || (p.region || "Азербайджан") === state.region) &&
      (!q || haystack.includes(q)) &&
      (!state.minRating || (rating != null && rating >= state.minRating)) &&
      ((state.minPrice == null && state.maxPrice == null) || (hasPrice &&
        (state.minPrice == null || priceMax >= state.minPrice) &&
        (state.maxPrice == null || priceMin <= state.maxPrice)));
  });
  return list.sort((a, b) => {
    const popularity = Number(b.review_count || 0) - Number(a.review_count || 0);
    const rating = Number(b.rating || 0) - Number(a.rating || 0);
    if (state.sort === "rating") return rating || popularity;
    if (state.sort === "price") {
      const ap = a.price_min == null ? Infinity : Number(a.price_min);
      const bp = b.price_min == null ? Infinity : Number(b.price_min);
      return ap - bp || popularity;
    }
    if (state.sort === "alphabetical") return String(a.title).localeCompare(String(b.title), "ru");
    return (kindOf(b) === "sight") - (kindOf(a) === "sight") || popularity || rating;
  });
};

function renderRegionFilter() {
  const select = $("#regionFilter");
  const regions = [...new Set(state.places.map((p) => String(p.region || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ru"));
  const selected = regions.includes(state.region) ? state.region : "all";
  select.innerHTML = [
    '<option value="all">Все города и регионы</option>',
    ...regions.map((region) => `<option value="${esc(region)}">${esc(region)}</option>`)
  ].join("");
  state.region = selected;
  select.value = selected;
}

function renderChips() {
  const used = Object.keys(CATEGORIES).filter((k) => state.places.some((p) => p.category === k));
  $("#chips").innerHTML = [["all", "Все"], ...used.map((k) => [k, CATEGORIES[k].title])]
    .map(([k, t]) => `<button class="chip" role="tab" aria-selected="${state.filter === k}" data-cat="${k}">${esc(t)}</button>`).join("");
}

function renderList() {
  const list = visible();
  $("#placeList").innerHTML = list.length ? list.map((p) => {
    const c = cat(p);
    return `<li><div class="row ${String(state.active) === String(p.id) ? "is-active" : ""}" data-place="${p.id}" role="button" tabindex="0">
      <span class="badge" style="--h:${c.hue}">${icon(c.icon)}</span>
      <span class="row__t"><strong>${esc(p.title)}</strong><small>${esc(c.title)}</small></span>
      ${favBtn(p)}</div></li>`;
  }).join("") : `<li class="empty">Ничего не найдено. Сбросьте фильтр или измените запрос.</li>`;
}

function applyFilter(fit = true) {
  const list = visible();
  renderChips(); renderList();
  mapView?.setPlaces(list, fit);
  if (state.active && !list.some((p) => String(p.id) === String(state.active))) closeSheet();
}

/* ---------- Карточка места поверх карты ---------- */
const sheet = $("#sheet");
function openPlace(id, { scroll = false } = {}) {
  const p = byId(id);
  if (!p) return;
  const origin = state.user || cityOrigin(p);
  state.active = id;
  if (scroll) $("#map").scrollIntoView({ behavior: "smooth", block: "start" });
  ensureMap().clearRoute();
  mapView.focus(p);
  renderSheet(); renderList();
  // Расстояние и время считаем от пользователя (если разрешил геолокацию) или от центра города
  route([origin, p]).then((r) => {
    if (String(state.active) !== String(id)) return;
    const el = $("#eta");
    if (el) el.innerHTML = `${icon("route")}<span><strong>${fmtDist(r.km)}</strong> · <strong>${fmtDur(r.min)}</strong> на машине от ${state.user ? "вас" : esc(origin.label || p.city || CENTER.label)}</span>`;
  }).catch(() => { const el = $("#eta"); if (el) el.textContent = "Расстояние сейчас недоступно"; });
}
function closeSheet() { state.active = null; sheet.hidden = true; renderList(); mapView?.clearRoute(); }

function renderSheet() {
  const p = byId(state.active);
  if (!p) { sheet.hidden = true; return; }
  const c = cat(p);
  const price = priceText(p);
  sheet.hidden = false;
  sheet.innerHTML = `
    <div class="sheet__top"><span class="badge badge--lg" style="--h:${c.hue}">${icon(c.icon)}</span>
      <div><h3>${esc(p.title)}</h3><p class="muted">${esc(c.title)}${p.rating ? ` · ${icon("star")} ${p.rating}` : ""}</p></div>
      <button class="icon-btn" data-close aria-label="Закрыть">${icon("x")}</button></div>
    ${cover(p, "sheet__img")}
    <p class="sheet__desc">${esc(p.description)}</p>
    ${p.address ? `<p class="muted">${esc(p.address)}${p.city ? ` · ${esc(p.city)}` : ""}</p>` : ""}
    ${p.opening_hours ? `<p class="muted">Часы работы: ${esc(p.opening_hours)}</p>` : ""}
    ${p.phone ? `<p class="muted"><a href="${esc(telUrl(p.phone))}">${esc(p.phone)}</a></p>` : ""}
    ${price ? `<p class="muted">Стоимость: ${esc(price)}</p>` : ""}
    ${p.review_count != null ? `<p class="muted">${Number(p.review_count).toLocaleString("ru-RU")} отзывов</p>` : ""}
    ${p.source_urls?.[0] ? `<p class="muted"><a href="${esc(p.source_urls[0])}" target="_blank" rel="noopener">Источник информации</a></p>` : ""}
    ${p.is_approx ? `<p class="note">Положение на карте приблизительное. Google Maps найдёт место по названию.</p>` : ""}
    <p class="eta" id="eta">${icon("route")}<span>Считаем маршрут…</span></p>
    <div class="sheet__actions">
      <a class="btn btn--primary" target="_blank" rel="noopener" href="${googleUrl(p, state.user)}">${icon("nav")}Построить маршрут</a>
      <a class="btn" target="_blank" rel="noopener" href="${osmUrl([state.user || cityOrigin(p), p])}">OpenStreetMap</a>
      ${p.map_url ? `<a class="btn" target="_blank" rel="noopener" href="${esc(p.map_url)}">Открыть карточку на карте</a>` : ""}
      <button class="btn" data-plan-add="${p.id}">${icon("plus")}В маршрут</button>
      ${favBtn(p, "icon-btn--lg")}
    </div>`;
  hydratePhotos(sheet);
}

/* ---------- Направления: «Открой город» и «Куда сходить» ---------- */
const citiesFor = (pred) => {
  const m = new Map();
  state.places.filter(pred).forEach((p) => p.city && m.set(p.city, (m.get(p.city) || 0) + 1));
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
};
const cityAliases = {
  "Баку": "baku", "Гянджа": "ganja gence", "Шеки": "sheki shaki",
  "Казань": "kazan", "Сочи": "sochi", "Тбилиси": "tbilisi", "Батуми": "batumi",
  "Екатеринбург": "ekaterinburg", "Нижний Тагил": "nizhny tagil",
  "Санкт-Петербург": "saint petersburg spb", "Москва": "moscow"
};
const citySearchText = (value) => String(value || "").toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
const cityChips = (list, active, query = "") => {
  const q = citySearchText(query);
  const filtered = q ? list.filter(([city]) => citySearchText(`${city} ${cityAliases[city] || ""}`).includes(q)) : list;
  return filtered.length
    ? filtered.map(([c, n]) => `<button class="chip" role="tab" aria-selected="${c === active}" data-city="${esc(c)}">${esc(c)} <small>${n}</small></button>`).join("")
    : `<p class="city-empty">Город не найден. Попробуйте другое название.</p>`;
};
let discoverCityQuery = "";
let venueCityQuery = "";
let waterCityQuery = "";
let waterCity = "";
const byQuality = (a, b) => (Number(b.rating || 0) - Number(a.rating || 0)) || (Number(b.review_count || 0) - Number(a.review_count || 0)) || (!!b.image - !!a.image) || String(a.title).localeCompare(String(b.title), "ru");

function renderDiscover() {
  const sights = citiesFor((p) => kindOf(p) === "sight");
  if (!sights.some(([c]) => c === state.city)) state.city = sights[0]?.[0] || state.city;
  $("#discoverCities").innerHTML = cityChips(sights, state.city, discoverCityQuery);
  const items = state.places.filter((p) => kindOf(p) === "sight" && p.city === state.city).sort(byQuality);
  $("#discoverGrid").innerHTML = items.length
    ? items.map((p, i) => placeCard(p, favBtn, { large: i < 2 && items.length > 3 })).join("")
    : `<div class="card empty"><p>Для этого города достопримечательностей пока нет в каталоге.</p></div>`;
  hydratePhotos($("#discoverGrid"));
}

function renderVenues() {
  const cities = citiesFor((p) => kindOf(p) === "venue" && p.category !== "aquapark");
  if (!cities.some(([c]) => c === state.venueCity) && cities.length) state.venueCity = cities[0][0];
  $("#venueCities").innerHTML = cityChips(cities, state.venueCity, venueCityQuery);
  const inCity = state.places.filter((p) => kindOf(p) === "venue" && p.category !== "aquapark" && p.city === state.venueCity);
  // Не засоряем интерфейс нулевыми категориями: показываем только то,
  // что действительно доступно в выбранном городе. Данные при этом не скрываются.
  const groups = VENUE_GROUPS
    .filter((g) => g.key !== "aquapark")
    .map((g) => [g, inCity.filter((p) => g.cats.includes(p.category)).length])
    .filter(([, count]) => count > 0);
  $("#venueGroups").innerHTML = [`<button class="chip" role="tab" aria-selected="${state.venueGroup === "all"}" data-vgroup="all">Все <small>${inCity.length}</small></button>`,
    ...groups.map(([g, n]) => `<button class="chip ${n ? "" : "is-empty"}" role="tab" aria-selected="${state.venueGroup === g.key}" data-vgroup="${g.key}">${esc(g.title)} <small>${n}</small></button>`)].join("");
  const sort = $("#venueSort").value;
  const items = inCity.filter((p) => state.venueGroup === "all" || groupOf(p)?.key === state.venueGroup)
    .sort(sort === "price" ? (a, b) => (a.price_min ?? Infinity) - (b.price_min ?? Infinity) : sort === "popular" ? (a, b) => Number(b.review_count || 0) - Number(a.review_count || 0) : byQuality);
  $("#venueGrid").innerHTML = items.length
    ? items.map((p) => placeCard(p, favBtn)).join("")
    : `<div class="card empty"><p>В городе «${esc(state.venueCity)}» пока нет заведений в этой категории. Выберите другую категорию или город.</p></div>`;
  hydratePhotos($("#venueGrid"));
}

function renderAquaparks() {
  const parks = state.places.filter((p) => p.category === "aquapark");
  const cities = citiesFor((p) => p.category === "aquapark");
  if (!cities.some(([c]) => c === waterCity) && cities.length) waterCity = cities[0][0];
  const q = citySearchText(waterCityQuery);
  const filteredCities = q ? cities.filter(([c]) => citySearchText(`${c} ${cityAliases[c] || ""}`).includes(q)) : cities;
  $("#waterparkCities").innerHTML = filteredCities.length
    ? filteredCities.map(([c,n]) => `<button class="chip" role="tab" aria-selected="${c === waterCity}" data-water-city="${esc(c)}">${esc(c)} <small>${n}</small></button>`).join("")
    : `<p class="city-empty">Город не найден. Попробуйте другое название.</p>`;
  const items = parks.filter((p) => p.city === waterCity).sort(byQuality);
  $("#waterparkGrid").innerHTML = items.length
    ? items.map((p) => placeCard(p, favBtn)).join("")
    : `<div class="card empty"><p>В этом городе аквапарков пока нет в каталоге.</p></div>`;
  hydratePhotos($("#waterparkGrid"));
}

function renderDirections() {
  const sights = state.places.filter((p) => kindOf(p) === "sight").length;
  $("#dirSights").textContent = `${sights} мест в каталоге`;
  $("#dirVenues").textContent = `${state.places.length - sights} заведений в каталоге`;
}

/* ---------- Маршруты ---------- */
function renderRoutes() {
  $("#routeGrid").innerHTML = state.routes.map((r) => {
    const stops = r.places.map(byId).filter(Boolean);
    return `<article class="card route" data-route="${r.id}">
      <h3>${esc(r.title)}</h3><p class="muted">${esc(r.description)}</p>
      <ol class="stops">${stops.map((s) => `<li><span>${esc(s.title)}</span><small>${esc(cat(s).title)}</small></li>`).join("")}</ol>
      <p class="eta" data-route-eta></p>
      <div class="route__actions">
        <button class="btn btn--primary" data-show-route="${r.id}">${icon("pin")}Показать на карте</button>
        <a class="btn" target="_blank" rel="noopener" href="${googleUrl(stops.at(-1), stops[0], stops.slice(1, -1))}">Google Maps</a>
      </div></article>`;
  }).join("");
}

async function showRoute(id) {
  const r = state.routes.find((x) => String(x.id) === String(id));
  const stops = r.places.map(byId).filter(Boolean);
  if (stops.length < 2) return;
  state.region = stops[0].region || "Азербайджан";
  $("#regionFilter").value = state.region;
  state.filter = "all"; state.q = ""; $("#search").value = "";
  closeSheet(); applyFilter(false);
  $("#map").scrollIntoView({ behavior: "smooth", block: "start" });
  const info = await ensureMap().drawRoute(stops);
  const msg = info ? `${r.title}: ${fmtDist(info.km)}, ${fmtDur(info.min)} в пути` : `${r.title}: маршрут показан по прямой`;
  toast(msg);
  const el = $(`[data-route="${id}"] [data-route-eta]`);
  if (el && info) el.innerHTML = `${icon("route")}<span><strong>${fmtDist(info.km)}</strong> · <strong>${fmtDur(info.min)}</strong> по дорогам</span>`;
}

/* ---------- Подборки, галерея, избранное ---------- */
function renderCollections() {
  $("#collectionGrid").innerHTML = Object.entries(CATEGORIES).map(([k, c]) => {
    const items = state.places.filter((p) => p.category === k);
    if (!items.length) return "";
    return `<button class="card collection" data-collection="${k}" style="--h:${c.hue}">
      <span class="badge badge--lg">${icon(c.icon)}</span>
      <h3>${esc(c.title)}</h3><p class="muted">${esc(c.blurb)}</p>
      <small class="muted">${items.length} ${items.length === 1 ? "место" : items.length < 5 ? "места" : "мест"}</small></button>`;
  }).join("");
}

function renderFavs() {
  const items = state.places.filter((p) => state.favs.has(p.id));
  $("#favStatus").textContent = state.mode === "supabase" ? "Синхронизируется между вашими устройствами" : "Хранится только на этом устройстве";
  $("#favCount").textContent = items.length;
  $("#favGrid").innerHTML = items.length ? items.map((p) => {
    const c = cat(p);
    return `<article class="card fav"><span class="badge" style="--h:${c.hue}">${icon(c.icon)}</span>
      <div class="fav__t"><h3>${esc(p.title)}</h3><p class="muted">${esc(c.title)}</p></div>
      <button class="btn btn--sm" data-place-open="${p.id}">На карте</button>${favBtn(p)}</article>`;
  }).join("") : `<div class="empty card"><p>Здесь появятся места, которые вы отметили сердечком.</p><a class="btn btn--primary" href="#map">Выбрать на карте</a></div>`;
}

function renderHero() {
  // Счётчики каталога не должны зависеть от наличия маршрутов.
  $("#cPlaces").textContent = state.places.length;
  $("#cRoutes").textContent = state.routes.length;
  $("#cCats").textContent = new Set(state.places.map((p) => p.category).filter(Boolean)).size;
  const r = state.routes[1] || state.routes[0];
  if (!r) {
    $("#heroRoute").innerHTML = '<p class="muted">Маршруты скоро появятся</p>';
    return;
  }
  const routePlaceIds = Array.isArray(r.places) ? r.places : [];
  const stops = routePlaceIds.map((id) => byId(Number(id))).filter(Boolean);
  $("#heroRoute").innerHTML = `<p class="muted">Маршрут на вечер</p><h3>${esc(r.title)}</h3>
    <ol class="stops stops--sm">${stops.map((s) => `<li><span>${esc(s.title)}</span></li>`).join("")}</ol>
    <button class="btn btn--primary btn--sm" data-show-route="${r.id}">Показать на карте</button>`;
}

/* ---------- Делегирование событий ---------- */
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-fav],[data-close],[data-city],[data-water-city],[data-vgroup],[data-cat],[data-place],[data-place-open],[data-collection],[data-show-route]");
  if (!t) return;
  if (t.dataset.fav) { e.stopPropagation(); return toggleFav(+t.dataset.fav); }
  if (t.hasAttribute("data-close")) return closeSheet();
  if (t.dataset.waterCity) { waterCity = t.dataset.waterCity; waterCityQuery = ""; $("#waterparkCitySearch").value = ""; return renderAquaparks(); }
  if (t.dataset.city) {
    if (t.closest("#venueCities")) {
      state.venueCity = t.dataset.city; state.venueGroup = "all"; venueCityQuery = "";
      $("#venueCitySearch").value = ""; return renderVenues();
    }
    state.city = t.dataset.city; discoverCityQuery = "";
    $("#discoverCitySearch").value = ""; return renderDiscover();
  }
  if (t.dataset.vgroup) { state.venueGroup = t.dataset.vgroup; return renderVenues(); }
  if (t.dataset.cat) { state.filter = t.dataset.cat; return applyFilter(); }
  if (t.dataset.place) return openPlace(+t.dataset.place);
  if (t.dataset.placeOpen) {
    const place = byId(+t.dataset.placeOpen);
    if (place?.region) { state.region = place.region; $("#regionFilter").value = state.region; }
    state.filter = "all"; state.q = ""; $("#search").value = ""; applyFilter(false);
    return openPlace(+t.dataset.placeOpen, { scroll: true });
  }
  if (t.dataset.collection) { state.filter = t.dataset.collection; state.q = ""; $("#search").value = ""; closeSheet(); applyFilter(); return $("#map").scrollIntoView({ behavior: "smooth" }); }
  if (t.dataset.showRoute) return showRoute(+t.dataset.showRoute);
});
$("#placeList").addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.dataset.place) { e.preventDefault(); openPlace(+e.target.dataset.place); }
});
$("#search").addEventListener("input", (e) => { state.q = e.target.value; applyFilter(); });
$("#resetFilters").addEventListener("click", () => {
  Object.assign(state, { filter: "all", region: "all", q: "", minRating: 0, minPrice: null, maxPrice: null, sort: "popularity" });
  $("#search").value = ""; $("#regionFilter").value = "all"; $("#priceMin").value = ""; $("#priceMax").value = "";
  $("#minRating").value = "0"; $("#sortPlaces").value = "popularity"; closeSheet(); applyFilter();
});
$("#regionFilter").addEventListener("change", (e) => { state.region = e.target.value; closeSheet(); applyFilter(); });
$("#priceMin").addEventListener("input", (e) => { state.minPrice = e.target.value === "" ? null : Number(e.target.value); applyFilter(); });
$("#priceMax").addEventListener("input", (e) => { state.maxPrice = e.target.value === "" ? null : Number(e.target.value); applyFilter(); });
$("#minRating").addEventListener("change", (e) => { state.minRating = Number(e.target.value); applyFilter(); });
$("#sortPlaces").addEventListener("change", (e) => { state.sort = e.target.value; applyFilter(false); });
$("#venueSort").addEventListener("change", renderVenues);
$("#discoverCitySearch").addEventListener("input", (e) => {
  discoverCityQuery = e.target.value;
  const cities = citiesFor((p) => kindOf(p) === "sight");
  $("#discoverCities").innerHTML = cityChips(cities, state.city, discoverCityQuery);
});
$("#waterparkCitySearch").addEventListener("input", (e) => { waterCityQuery = e.target.value; renderAquaparks(); });
$("#venueCitySearch").addEventListener("input", (e) => {
  venueCityQuery = e.target.value;
  const cities = citiesFor((p) => kindOf(p) === "venue");
  $("#venueCities").innerHTML = cityChips(cities, state.venueCity, venueCityQuery);
});
$("#fitBtn").addEventListener("click", () => { ensureMap().clearRoute(); mapView.fit(visible()); });
$("#locateBtn").addEventListener("click", async () => {
  try {
    state.user = await ensureMap().locate();
    toast("Местоположение определено");
    mapView.map.flyTo([state.user.latitude, state.user.longitude], 13);
    if (state.active) openPlace(state.active);
  } catch (err) { toast(err.message); }
});

/* ---------- Запуск ---------- */
function renderCatalog() {
  renderRegionFilter();
  renderHero(); renderDirections(); renderDiscover(); renderVenues(); renderAquaparks();
  renderChips(); renderList(); renderRoutes(); renderCollections(); renderFavs();
}

function init() {
  // Сначала мгновенно показываем встроенный каталог. Интерфейс и карта не должны
  // зависеть от скорости ответа Supabase: даже медленная сеть не оставит страницу пустой.
  Object.assign(state, { places: PLACES, routes: ROUTES, favs: new Set(state.favs), mode: "local" });
  renderCatalog();
  initPlanner();
  initIdeal({ favBtn });
  subscribeFavorites((favs) => {
    state.favs = favs;
    renderFavs(); renderList(); renderSheet(); renderDiscover(); renderVenues(); refreshIdeal();
  });

  // Карта и локальный каталог запускаются независимо от сетевого запроса.
  try {
    ensureMap();
    requestAnimationFrame(() => mapView?.refresh());
  } catch (error) {
    console.error("Не удалось запустить карту:", error);
    const canvas = $("#mapCanvas");
    if (canvas) canvas.innerHTML = '<div class="empty map-error">Карта временно недоступна. Список мест и каталог продолжают работать.</div>';
  }

  // Когда Supabase ответит, заменяем резервные данные полным актуальным каталогом.
  // Если сеть недоступна, уже показанные локальные данные остаются на странице.
  loadData().then((data) => {
    if (!data?.places?.length) return;
    Object.assign(state, data);
    renderCatalog();
    renderPlanner();
    refreshIdeal();
    mapView?.setPlaces(visible(), true);
    requestAnimationFrame(() => mapView?.refresh());
  }).catch((error) => {
    console.error("Не удалось обновить каталог из Supabase; оставлены резервные данные:", error);
  });
}
init();
