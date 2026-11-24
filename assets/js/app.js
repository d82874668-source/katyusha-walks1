// Точка входа: рендер секций, навигация, взаимодействие с картой.
import { CATEGORIES, PLACES, ROUTES } from "./data.js?v=20261124mapcategories";
import { loadData, setFavorite, subscribeFavorites } from "./store.js?v=20261124mapcategories";
import { MapView, CENTER, googleUrl, osmUrl, route, fmtDist, fmtDur, hasExactCoordinates } from "./map.js?v=20261124noticefix";
import { state, byId } from "./state.js?v=20261124s";
import { $, $$, icon, esc, telUrl, cat, priceText, placeCard, toast, cover, hydratePhotos } from "./ui.js?v=20261124p";
import { kindOf, groupOf, VENUE_GROUPS } from "./taxonomy.js?v=20261124audit";
import { initPlanner, addToPlan, renderPlanner } from "./planner.js?v=20261124x";
import { initIdeal, refreshIdeal } from "./ideal.js?v=20261124w";

const categoryAliases = { gaming: ["ПК-клубы", "PC-клубы", "игровые компьютерные клубы"], gaming247: ["круглосуточные компьютерные клубы", "24/7"] };
const cityOrigin = (place) => {
  if (!place.city) return CENTER;
  const sameCity = state.places.filter((p) => p.city === place.city && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)));
  if (!sameCity.length) return CENTER;
  return {
    latitude: sameCity.reduce((sum, p) => sum + Number(p.latitude), 0) / sameCity.length,
    longitude: sameCity.reduce((sum, p) => sum + Number(p.longitude), 0) / sameCity.length,
    label: place.city || CENTER.label,
    is_approx: true, // это лишь ориентир по городу, а не реальная точка старта
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
  renderFavs(); renderList(); renderSheet(); renderDiscover(); renderVenues(); refreshIdeal();
}
const favBtn = (p, cls = "") => {
  const on = state.favs.has(p.id);
  return `<button class="icon-btn ${cls} ${on ? "is-fav" : ""}" data-fav="${p.id}" aria-pressed="${on}" aria-label="${on ? "Убрать из избранного" : "В избранное"}">${icon("heart")}</button>`;
};

/* ---------- Карта: фильтры и список ---------- */
// Фильтр карты работает по фактическому городу/стране, а не только по полю region:
 // в каталоге region местами означает город, местами область или страну.
const regionValues = () => [...new Set(state.places.flatMap((p) =>
  [p.country, p.region, p.city].map((value) => String(value || "").trim()).filter(Boolean)
))];

const matchesMapRegion = (place) => {
  if (state.region === "all") return true;
  const selected = String(state.region).trim();
  // Город, административный регион и страна — равноправные варианты фильтра.
  // Совпадение проверяется по всем трём полям, чтобы не терять места,
  // у которых region заполнен областью, а city — населённым пунктом.
  return [place.city, place.region, place.country]
    .some((value) => String(value || "").trim() === selected);
};

const visible = () => {
  const q = state.q.trim().toLocaleLowerCase("ru");
  const list = state.places.filter((p) => {
    const category = CATEGORIES[p.category]?.title || p.category || "";
    const haystack = [p.title, p.address, p.city, p.region, p.description, category, ...(categoryAliases[p.category] || [])].filter(Boolean).join(" ").toLocaleLowerCase("ru");
    const rating = p.rating == null ? null : Number(p.rating);
    const priceMin = p.price_min == null ? null : Number(p.price_min);
    const priceMax = p.price_max == null ? null : Number(p.price_max);
    const hasPrice = priceMin != null && priceMax != null && Number.isFinite(priceMin) && Number.isFinite(priceMax);
    const categoryMatches = state.filter === "all" ||
      p.category === state.filter ||
      (state.filter === "spa" && p.category === "bath");
    return categoryMatches &&
      matchesMapRegion(p) &&
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
  const input = $("#regionFilter");
  // Полный справочник: страны, административные регионы/области и все города каталога.
  const values = regionValues().sort((a, b) => a.localeCompare(b, "ru"));
  const selected = values.includes(state.region) ? state.region : "all";
  $("#regionOptions").innerHTML = values.map((value) => {
    const country = state.places.some((p) => p.country === value);
    const region = state.places.some((p) => p.region === value);
    const city = state.places.some((p) => p.city === value);
    const type = [country && "страна", region && "регион", city && "город"].filter(Boolean).join(" · ");
    return `<option value="${esc(value)}" label="${esc(type)}"></option>`;
  }).join("");
  state.region = selected;
  input.value = selected === "all" ? "" : selected;
}

const mapCategoryGroups = [
  { title: "Отдых и оздоровление", keys: ["spa", "bath", "thermal", "massage", "hotel", "resort", "pool", "gym"] },
  { title: "Еда и напитки", keys: ["restaurant", "cafe", "coffee", "bakery", "fastfood", "foodcourt", "bar", "pub", "winebar", "lounge", "hookah"] },
  { title: "Ночная жизнь", keys: ["nightclub", "karaoke"] },
  { title: "Развлечения и игры", keys: ["capybara", "zoo", "gaming", "gaming247", "esports", "gamecenter", "vr", "quest", "anticafe", "karting", "billiards", "bowling", "cinema", "entertainment"] },
  { title: "Прогулки и природа", keys: ["park", "square", "nature", "garden", "sea", "boat", "beach", "aquapark", "embankment", "viewpoint", "trips"] },
  { title: "Культура и город", keys: ["city", "monument", "historic", "theatre", "museum", "exhibition", "cultural_space", "attraction", "market", "shop", "mall", "excursion", "recreation"] }
];
let mapCategoryQuery = "";
let mapCategoryOpen = false;
const mapCategoryText = (value) => String(value || "").toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
function renderChips() {
  const inRegion = state.places.filter(matchesMapRegion);
  const counts = new Map();
  inRegion.forEach((p) => {
    if (!p.category) return;
    // «Бани» и «SPA» объединены в один пункт карты.
    const key = p.category === "bath" ? "spa" : p.category;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  // Sea Breeze и «Белый город» — азербайджанские категории.
  // Не показываем их в общем каталоге регионов; они доступны при выборе
  // Азербайджана или конкретного азербайджанского города.
  const isAzerbaijanContext = state.region !== "all" &&
    inRegion.length > 0 &&
    inRegion.every((place) => place.country === "Азербайджан");
  const azerbaijanOnlyCategories = new Set(["resort", "city"]);
  const used = Object.keys(CATEGORIES).filter((key) =>
    counts.has(key) && (isAzerbaijanContext || !azerbaijanOnlyCategories.has(key))
  );
  if (state.filter !== "all" && !used.includes(state.filter)) state.filter = "all";
  const q = mapCategoryText(mapCategoryQuery);
  const allCount = inRegion.length;
  const allButton = `<button class="map-category-option map-category-all" role="option" aria-selected="${state.filter === "all"}" data-cat="all"><span>Все категории</span><small>${allCount}</small></button>`;
  const known = new Set();
  const sections = mapCategoryGroups.map((group) => {
    const keys = group.keys.filter((key) => used.includes(key));
    keys.forEach((key) => known.add(key));
    const filtered = keys.filter((key) => !q || mapCategoryText(`${CATEGORIES[key].title} ${CATEGORIES[key].blurb || ""} ${(categoryAliases[key] || []).join(" ")}`).includes(q));
    if (!filtered.length) return "";
    return `<div class="map-category-group">
      <div class="map-category-heading"><strong>${esc(group.title)}</strong><span>${filtered.reduce((sum,key)=>sum+counts.get(key),0)} мест</span></div>
      <div class="map-category-options">${filtered.map((key) => `<button class="map-category-option" role="option" aria-selected="${state.filter === key}" data-cat="${key}"><span>${esc(CATEGORIES[key].title)}</span><small>${counts.get(key)}</small></button>`).join("")}</div>
    </div>`;
  }).join("");
  const other = used.filter((key) => !known.has(key) && (!q || mapCategoryText(`${CATEGORIES[key].title} ${(categoryAliases[key] || []).join(" ")}`).includes(q)));
  const otherHtml = other.length ? `<div class="map-category-group"><div class="map-category-heading"><strong>Другие категории</strong><span>${other.reduce((sum,key)=>sum+counts.get(key),0)} мест</span></div><div class="map-category-options">${other.map((key) => `<button class="map-category-option" role="option" aria-selected="${state.filter === key}" data-cat="${key}"><span>${esc(CATEGORIES[key].title)}</span><small>${counts.get(key)}</small></button>`).join("")}</div></div>` : "";
  const menu = $("#chips");
  menu.innerHTML = allButton + sections + otherHtml || `<p class="city-empty">Категории не найдены. Попробуйте другой запрос.</p>`;
  menu.hidden = !mapCategoryOpen;
  const input = $("#categorySearch");
  if (document.activeElement !== input && !mapCategoryQuery) input.value = state.filter === "all" ? "" : CATEGORIES[state.filter]?.title || "";
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
  renderChips();
  const list = visible();
  renderList();
  mapView?.setPlaces(list, fit);
  if (state.active && !list.some((p) => String(p.id) === String(state.active))) closeSheet();
}

/* ---------- Карточка места поверх карты ---------- */
const sheet = $("#sheet");
function openPlace(id, { scroll = false } = {}) {
  const p = byId(id);
  if (!p) return;
  recordVisit(p.id);
  const origin = state.user || cityOrigin(p);
  state.active = id;
  if (scroll) $("#map").scrollIntoView({ behavior: "smooth", block: "start" });
  ensureMap().clearRoute();
  mapView.focus(p);
  renderSheet(); renderList();
  // Для приблизительных координат не рассчитываем расстояние по центру города.
  if (p.is_approx || !hasExactCoordinates(p)) {
    const el = $("#eta");
    if (el) el.textContent = "Точная точка уточняется — расстояние пока не рассчитываем";
    return;
  }
  if (origin.is_approx || !hasExactCoordinates(origin)) {
    const el = $("#eta");
    if (el) el.textContent = "Включите геолокацию, чтобы рассчитать расстояние от вас";
    return;
  }
  // Точное расстояние считаем только от подтверждённой геолокации пользователя.
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
  const ratingLine = p.rating
    ? `<span class="sheet__rating">${icon("star")}${esc(p.rating)}${p.review_count != null ? ` (${Number(p.review_count).toLocaleString("ru-RU")} отзывов)` : ""}</span>`
    : (p.review_count != null ? `<span class="sheet__rating">${Number(p.review_count).toLocaleString("ru-RU")} отзывов</span>` : "");
  const sourceLink = p.source_urls?.[0]
    ? `<a href="${esc(p.source_urls[0])}" target="_blank" rel="noopener">Источник информации</a>`
    : "";
  const osmLink = !p.is_approx
    ? `<a href="${osmUrl([state.user || cityOrigin(p), p])}" target="_blank" rel="noopener">OpenStreetMap</a>`
    : "";
  sheet.innerHTML = `
    <div class="sheet__top"><span class="badge badge--lg" style="--h:${c.hue}">${icon(c.icon)}</span>
      <div><h3>${esc(p.title)}</h3><p class="muted">${esc(c.title)}${ratingLine ? ` · ${ratingLine}` : ""}</p></div>
      <button class="icon-btn" data-close aria-label="Закрыть">${icon("x")}</button></div>
    <div class="sheet__media">${cover(p, "sheet__img")}</div>
    <div class="sheet__content">
      ${p.description ? `<p class="sheet__desc">${esc(p.description)}</p>` : ""}
      ${p.address ? `<p class="sheet__detail">${icon("pin")}<span>${esc(p.address)}${p.city ? ` · ${esc(p.city)}` : ""}</span></p>` : ""}
      ${p.opening_hours ? `<p class="sheet__detail">${icon("clock")}<span>Часы работы: ${esc(p.opening_hours)}</span></p>` : ""}
      ${p.phone ? `<p class="sheet__detail"><span class="sheet__detail-label">Телефон</span><a href="${esc(telUrl(p.phone))}">${esc(p.phone)}</a></p>` : ""}
      ${price ? `<p class="sheet__detail">${icon("wallet")}<span>Стоимость: ${esc(price)}</span></p>` : ""}
      ${p.is_approx ? `<p class="note">Положение на карте приблизительное. Google Maps найдёт место по названию.</p>` : ""}
    </div>
    <p class="eta" id="eta">${icon("route")}<span>Считаем маршрут…</span></p>
    <div class="sheet__actions">
      <a class="btn btn--primary" target="_blank" rel="noopener" href="${googleUrl(p, state.user)}">${icon("nav")}Построить маршрут</a>
      ${p.map_url ? `<a class="btn" target="_blank" rel="noopener" href="${esc(p.map_url)}">Открыть карточку на карте</a>` : ""}
      <button class="btn" data-plan-add="${p.id}">${icon("plus")}В маршрут</button>
      ${favBtn(p, "icon-btn--lg")}
    </div>
    <div class="sheet__foot">${osmLink}${osmLink && sourceLink ? `<span aria-hidden="true">·</span>` : ""}${sourceLink}</div>`;
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
// Страна — верхний уровень каталога. Города остаются внутри страны, а не превращаются в отдельные регионы.
const countryOf = (place) => place.country || (/Грузия|Тбилиси|Батуми/i.test(`${place.region || ""} ${place.city || ""}`) ? "Грузия" : /Азербайджан|Баку|Гянджа|Шеки|Габала|Губа|Гусар/i.test(`${place.region || ""} ${place.city || ""}`) ? "Азербайджан" : /Казахстан|Алматы/i.test(`${place.region || ""} ${place.city || ""}`) ? "Казахстан" : "Россия");
let discoverCountry = "all";
let venueCountry = "all";
const countryChips = (list, active) => [
  `<button class="chip" role="tab" aria-selected="${active === "all"}" data-country="all">Все регионы <small>${list.reduce((n, x) => n + x[1], 0)}</small></button>`,
  ...list.map(([name, count]) => `<button class="chip" role="tab" aria-selected="${name === active}" data-country="${esc(name)}">${esc(name)} <small>${count}</small></button>`)
].join("");
const citySearchText = (value) => String(value || "").toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
const cityChips = (list, active, query = "") => {
  const q = citySearchText(query);
  const filtered = q ? list.filter(([city]) => citySearchText(`${city} ${cityAliases[city] || ""}`).includes(q)) : list;
  const allButton = !q ? `<button class="chip" role="tab" aria-selected="${active === "all"}" data-city="all">Все города <small>${list.reduce((sum, [, count]) => sum + count, 0)}</small></button>` : "";
  return filtered.length
    ? allButton + filtered.map(([c, n]) => `<button class="chip" role="tab" aria-selected="${c === active}" data-city="${esc(c)}">${esc(c)} <small>${n}</small></button>`).join("")
    : `<p class="city-empty">Город не найден. Попробуйте другое название.</p>`;
};
const groupedCityChips = (places, active, query = "") => {
  const q = citySearchText(query);
  const groups = new Map();
  places.forEach((place) => {
    if (!place.city) return;
    const country = countryOf(place);
    if (!groups.has(country)) groups.set(country, new Map());
    const cities = groups.get(country);
    cities.set(place.city, (cities.get(place.city) || 0) + 1);
  });
  const sortedGroups = [...groups].map(([country, cities]) => ({
    country,
    cities: [...cities].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru")),
    total: [...cities.values()].reduce((sum, count) => sum + count, 0)
  })).sort((a, b) => b.total - a.total || a.country.localeCompare(b.country, "ru"));
  const allCount = sortedGroups.reduce((sum, group) => sum + group.total, 0);
  const allButton = !q ? `<button class="chip" role="tab" aria-selected="${active === "all"}" data-city="all">Все города <small>${allCount}</small></button>` : "";
  const sections = sortedGroups.map((group) => {
    const cities = q ? group.cities.filter(([city]) => citySearchText(`${city} ${cityAliases[city] || ""}`).includes(q)) : group.cities;
    if (!cities.length) return "";
    return `<div class="city-region-group">
      <div class="city-region-heading"><strong>${esc(group.country)}</strong><span>${group.total} мест</span></div>
      <div class="city-region-chips">${cities.map(([city, count]) => `<button class="chip" role="tab" aria-selected="${city === active}" data-city="${esc(city)}">${esc(city)} <small>${count}</small></button>`).join("")}</div>
    </div>`;
  }).join("");
  return allButton + (sections || (q ? `<p class="city-empty">Город не найден. Попробуйте другое название.</p>` : ""));
};
let discoverCityQuery = "";
let venueCityQuery = "";
const byQuality = (a, b) => (Number(b.rating || 0) - Number(a.rating || 0)) || (Number(b.review_count || 0) - Number(a.review_count || 0)) || (!!b.image - !!a.image) || String(a.title).localeCompare(String(b.title), "ru");

function renderDiscover() {
  const allSights = state.places.filter((p) => kindOf(p) === "sight");
  const countryCounts = new Map();
  allSights.forEach((p) => { const country = countryOf(p); countryCounts.set(country, (countryCounts.get(country) || 0) + 1); });
  const countries = [...countryCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
  if (discoverCountry !== "all" && !countryCounts.has(discoverCountry)) discoverCountry = "all";
  $("#discoverCountries").innerHTML = countryChips(countries, discoverCountry);
  const countrySights = discoverCountry === "all" ? allSights : allSights.filter((p) => countryOf(p) === discoverCountry);
  const cityCounts = new Map();
  countrySights.forEach((p) => p.city && cityCounts.set(p.city, (cityCounts.get(p.city) || 0) + 1));
  const cities = [...cityCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
  if (state.city !== "all" && !cities.some(([city]) => city === state.city)) state.city = "all";
  $("#discoverCities").innerHTML = discoverCountry === "all" ? groupedCityChips(allSights, state.city, discoverCityQuery) : cityChips(cities, state.city, discoverCityQuery);
  const items = countrySights.filter((p) => state.city === "all" || p.city === state.city).sort(byQuality);
  $("#discoverGrid").innerHTML = items.length
    ? items.slice(0, 10).map((p) => placeCard(p, favBtn)).join("")
    : `<div class="card empty"><p>Для выбранной страны и города достопримечательностей пока нет в каталоге.</p></div>`;
  hydratePhotos($("#discoverGrid"));
}

function renderVenues() {
  const allVenues = state.places.filter((p) => kindOf(p) === "venue");
  const countryCounts = new Map();
  allVenues.forEach((p) => { const country = countryOf(p); countryCounts.set(country, (countryCounts.get(country) || 0) + 1); });
  const countries = [...countryCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
  if (venueCountry !== "all" && !countryCounts.has(venueCountry)) venueCountry = "all";
  $("#venueCountries").innerHTML = countryChips(countries, venueCountry);
  const countryVenues = venueCountry === "all" ? allVenues : allVenues.filter((p) => countryOf(p) === venueCountry);
  const cityCounts = new Map();
  countryVenues.forEach((p) => p.city && cityCounts.set(p.city, (cityCounts.get(p.city) || 0) + 1));
  const cities = [...cityCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
  if (state.venueCity !== "all" && !cities.some(([city]) => city === state.venueCity)) state.venueCity = "all";
  $("#venueCities").innerHTML = cityChips(cities, state.venueCity, venueCityQuery);
  const inCity = countryVenues.filter((p) => state.venueCity === "all" || p.city === state.venueCity);
  // Не засоряем интерфейс нулевыми категориями: показываем только то,
  // что действительно доступно в выбранном городе. Данные при этом не скрываются.
  const groups = VENUE_GROUPS
    .map((g) => [g, inCity.filter((p) => g.cats.includes(p.category)).length])
    .filter(([, count]) => count > 0);
  $("#venueGroups").innerHTML = [`<button class="chip" role="tab" aria-selected="${state.venueGroup === "all"}" data-vgroup="all">Все <small>${inCity.length}</small></button>`,
    ...groups.map(([g, n]) => `<button class="chip ${n ? "" : "is-empty"}" role="tab" aria-selected="${state.venueGroup === g.key}" data-vgroup="${g.key}">${esc(g.title)} <small>${n}</small></button>`)].join("");
  const sort = $("#venueSort").value;
  const items = inCity.filter((p) => state.venueGroup === "all" || groupOf(p)?.key === state.venueGroup)
    .sort(sort === "price" ? (a, b) => (a.price_min ?? Infinity) - (b.price_min ?? Infinity) : sort === "popular" ? (a, b) => Number(b.review_count || 0) - Number(a.review_count || 0) : byQuality);
  $("#venueGrid").innerHTML = items.length
    ? items.slice(0, 10).map((p) => placeCard(p, favBtn)).join("")
    : `<div class="card empty"><p>В городе «${esc(state.venueCity)}» пока нет заведений в этой категории. Выберите другую категорию или город.</p></div>`;
  hydratePhotos($("#venueGrid"));
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
  state.region = stops[0].city || stops[0].region || stops[0].country || "Азербайджан";
  $("#regionFilter").value = state.region;
  state.filter = "all"; state.q = "";
  closeSheet(); applyFilter(false);
  $("#map").scrollIntoView({ behavior: "smooth", block: "start" });
  const info = await ensureMap().drawRoute(stops);
  const msg = info?.approximate
    ? `${r.title}: линия не построена — координаты ${info.totalStops - info.exactStops} остановок ещё уточняются. Названия можно открыть в Google Maps.`
    : info ? `${r.title}: ${fmtDist(info.km)}, ${fmtDur(info.min)} в пути` : `${r.title}: маршрут показан по прямой`;
  toast(msg);
  const el = $(`[data-route="${id}"] [data-route-eta]`);
  if (el && info && !info.approximate) el.innerHTML = `${icon("route")}<span><strong>${fmtDist(info.km)}</strong> · <strong>${fmtDur(info.min)}</strong> по дорогам</span>`;
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

const COLLECTIONS_KEY = "katyusha:custom-collections";
function readCustomCollections() {
  try {
    const value = JSON.parse(localStorage.getItem(COLLECTIONS_KEY));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
function renderCustomCollections() {
  const root = $("#customCollections");
  if (!root) return;
  const items = readCustomCollections();
  root.innerHTML = items.length ? items.map((collection) => {
    const places = (collection.placeIds || []).map(byId).filter(Boolean);
    const preview = places.slice(0, 3).map((p) => p.title).join(" · ");
    return `<article class="collection custom-collection">
      <span class="badge">${icon("heart")}</span>
      <h3>${esc(collection.title)}</h3>
      <p>${esc(preview || "Места из вашего избранного")}</p>
      <small>${places.length} мест</small>
      <div class="collection__actions">
        <button class="btn btn--sm btn--primary" data-custom-open="${esc(collection.id)}">В маршрут</button>
        <button class="btn btn--sm" data-custom-share="${esc(collection.id)}">Поделиться</button>
        <button class="btn btn--sm btn--ghost" data-custom-delete="${esc(collection.id)}">Удалить</button>
      </div>
    </article>`;
  }).join("") : `<div class="empty card"><p>Сохраните избранные места в отдельную подборку — например, «Романтический вечер» или «Выходные с детьми».</p></div>`;
}
function createCustomCollection(title) {
  const placeIds = state.places.filter((p) => state.favs.has(p.id)).map((p) => p.id);
  if (!placeIds.length) return toast("Сначала добавьте места в избранное");
  const items = readCustomCollections();
  items.unshift({ id: String(Date.now()), title, placeIds, createdAt: Date.now() });
  try { localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(items.slice(0, 30))); } catch {}
  renderCustomCollections();
  toast("Подборка сохранена");
}
async function shareCustomCollection(id) {
  const collection = readCustomCollections().find((x) => String(x.id) === String(id));
  if (!collection) return;
  const url = new URL(location.href);
  url.searchParams.set("plan", (collection.placeIds || []).join(","));
  url.searchParams.set("mode", "walk");
  url.searchParams.set("name", collection.title);
  try {
    if (navigator.share) { await navigator.share({ title: collection.title, url: url.toString() }); return; }
    await navigator.clipboard.writeText(url.toString());
    toast("Ссылка на подборку скопирована");
  } catch (error) {
    if (error?.name !== "AbortError") window.prompt("Скопируйте ссылку на подборку:", url.toString());
  }
}
const HISTORY_KEY = "katyusha:recent-places";
function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
function recordVisit(id) {
  const next = [{ id: Number(id), viewedAt: Date.now() }, ...readHistory().filter((x) => String(x.id) !== String(id))].slice(0, 12);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
  renderHistory();
}
function renderHistory() {
  const root = $("#historyGrid");
  if (!root) return;
  const items = readHistory().map((entry) => ({ entry, place: byId(entry.id) })).filter((x) => x.place);
  root.innerHTML = items.length ? items.map(({ entry, place: p }) => {
    const c = cat(p);
    const when = new Date(entry.viewedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    return `<article class="card fav"><span class="badge" style="--h:${c.hue}">${icon(c.icon)}</span>
      <div class="fav__t"><h3>${esc(p.title)}</h3><p class="muted">${esc(p.city || "")} · ${when}</p></div>
      <button class="btn btn--sm" data-place-open="${p.id}">Открыть</button>
      <button class="btn btn--sm btn--ghost" data-history-remove="${p.id}" aria-label="Убрать ${esc(p.title)} из истории">Убрать</button></article>`;
  }).join("") : `<div class="empty card"><p>Здесь появятся места, которые вы недавно открывали.</p></div>`;
}
function renderFavs() {
  const items = state.places.filter((p) => state.favs.has(p.id));
  $("#favStatus").textContent = "Хранится в этом браузере. Для синхронизации между устройствами потребуется вход.";
  $("#favCount").textContent = items.length;
  renderCustomCollections();
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
}

/* ---------- Делегирование событий ---------- */
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-fav],[data-close],[data-city],[data-vgroup],[data-cat],[data-place],[data-place-open],[data-collection],[data-show-route],[data-history-remove],[data-custom-open],[data-custom-share],[data-custom-delete]");
  if (!t) return;
  if (t.dataset.fav) { e.stopPropagation(); return toggleFav(+t.dataset.fav); }
  if (t.dataset.historyRemove) {
    const next = readHistory().filter((x) => String(x.id) !== String(t.dataset.historyRemove));
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
    return renderHistory();
  }
  if (t.dataset.customDelete) {
    const next = readCustomCollections().filter((x) => String(x.id) !== String(t.dataset.customDelete));
    try { localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(next)); } catch {}
    return renderCustomCollections();
  }
  if (t.dataset.customOpen) {
    const collection = readCustomCollections().find((x) => String(x.id) === String(t.dataset.customOpen));
    if (!collection) return;
    collection.placeIds.forEach((id) => addToPlan(id));
    $("#planner")?.scrollIntoView({ behavior: "smooth" });
    toast("Места добавлены в конструктор прогулки");
    return;
  }
  if (t.dataset.customShare) return shareCustomCollection(t.dataset.customShare);
  if (t.hasAttribute("data-close")) return closeSheet();
  if (t.dataset.country) {
    if (t.closest("#venueCountries")) {
      venueCountry = t.dataset.country; state.venueCity = "all"; venueCityQuery = "";
      $("#venueCitySearch").value = ""; return renderVenues();
    }
    discoverCountry = t.dataset.country; state.city = "all"; discoverCityQuery = "";
    $("#discoverCitySearch").value = ""; return renderDiscover();
  }
  if (t.dataset.city) {
    if (t.closest("#venueCities")) {
      state.venueCity = t.dataset.city; state.venueGroup = "all"; venueCityQuery = "";
      $("#venueCitySearch").value = ""; return renderVenues();
    }
    state.city = t.dataset.city; discoverCityQuery = "";
    $("#discoverCitySearch").value = ""; return renderDiscover();
  }
  if (t.dataset.vgroup) { state.venueGroup = t.dataset.vgroup; return renderVenues(); }
  if (t.dataset.cat) {
    state.filter = t.dataset.cat;
    mapCategoryQuery = "";
    mapCategoryOpen = false;
    $("#categorySearch").value = state.filter === "all" ? "" : CATEGORIES[state.filter]?.title || "";
    return applyFilter();
  }
  if (t.dataset.place) return openPlace(+t.dataset.place);
  if (t.dataset.placeOpen) {
    const place = byId(+t.dataset.placeOpen);
    if (place?.region) { state.region = place.region; $("#regionFilter").value = state.region; }
    state.filter = "all"; state.q = ""; applyFilter(false);
    return openPlace(+t.dataset.placeOpen, { scroll: true });
  }
  if (t.dataset.collection) { state.filter = t.dataset.collection; state.q = ""; closeSheet(); applyFilter(); return $("#map").scrollIntoView({ behavior: "smooth" }); }
  if (t.dataset.showRoute) return showRoute(+t.dataset.showRoute);
});
$("#placeList").addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.dataset.place) { e.preventDefault(); openPlace(+e.target.dataset.place); }
});
$("#customCollectionForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#customCollectionName");
  const title = input?.value.trim();
  if (!title) return toast("Введите название подборки");
  createCustomCollection(title);
  input.value = "";
});
$("#historyClear")?.addEventListener("click", () => {
  try { localStorage.removeItem(HISTORY_KEY); } catch {}
  renderHistory();
  toast("История очищена");
});
const categoryInput = $("#categorySearch");
categoryInput.addEventListener("focus", () => { mapCategoryOpen = true; mapCategoryQuery = ""; categoryInput.value = ""; renderChips(); });
categoryInput.addEventListener("click", () => { mapCategoryOpen = true; if (categoryInput.value === (state.filter === "all" ? "" : CATEGORIES[state.filter]?.title || "")) categoryInput.value = ""; mapCategoryQuery = ""; renderChips(); });
categoryInput.addEventListener("input", (e) => {
  mapCategoryQuery = e.target.value;
  mapCategoryOpen = true;
  renderChips();
});
categoryInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    mapCategoryOpen = false;
    mapCategoryQuery = "";
    categoryInput.value = state.filter === "all" ? "" : CATEGORIES[state.filter]?.title || "";
    renderChips();
    categoryInput.blur();
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    const q = mapCategoryText(categoryInput.value);
    if (!q) return;
    const inRegion = state.places.filter(matchesMapRegion);
    const used = [...new Set(inRegion.map((p) => p.category).filter(Boolean))];
    const match = used.find((key) => mapCategoryText(CATEGORIES[key]?.title) === q)
      || used.find((key) => mapCategoryText(`${CATEGORIES[key]?.title || ""} ${(categoryAliases[key] || []).join(" ")}`).includes(q));
    if (match) {
      state.filter = match;
      mapCategoryQuery = "";
      mapCategoryOpen = false;
      categoryInput.value = CATEGORIES[match].title;
      applyFilter();
    }
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".map-category-picker") && mapCategoryOpen) {
    mapCategoryOpen = false;
    mapCategoryQuery = "";
    renderChips();
  }
});

$("#resetFilters").addEventListener("click", () => {
  Object.assign(state, { filter: "all", region: "all", q: "", minRating: 0, minPrice: null, maxPrice: null, sort: "popularity" });
  $("#regionFilter").value = ""; $("#categorySearch").value = ""; mapCategoryQuery = ""; mapCategoryOpen = false; $("#priceMin").value = ""; $("#priceMax").value = "";
  $("#minRating").value = "0"; $("#sortPlaces").value = "popularity"; closeSheet(); applyFilter();
});
const regionInput = $("#regionFilter");
function applyTypedRegion() {
  const raw = regionInput.value.trim();
  if (!raw) state.region = "all";
  else {
    const values = regionValues();
    const match = values.find((value) => value.toLocaleLowerCase("ru") === raw.toLocaleLowerCase("ru"));
    if (match) state.region = match;
    else {
      const suggestion = values.find((value) => value.toLocaleLowerCase("ru").startsWith(raw.toLocaleLowerCase("ru")));
      if (suggestion) { state.region = suggestion; regionInput.value = suggestion; }
      else { state.region = raw; }
    }
  }
  closeSheet();
  applyFilter();
}
regionInput.addEventListener("change", applyTypedRegion);
regionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); applyTypedRegion(); regionInput.blur(); }
});
$("#priceMin").addEventListener("input", (e) => { state.minPrice = e.target.value === "" ? null : Number(e.target.value); applyFilter(); });
$("#priceMax").addEventListener("input", (e) => { state.maxPrice = e.target.value === "" ? null : Number(e.target.value); applyFilter(); });
$("#minRating").addEventListener("change", (e) => { state.minRating = Number(e.target.value); applyFilter(); });
$("#sortPlaces").addEventListener("change", (e) => { state.sort = e.target.value; applyFilter(false); });
$("#venueSort").addEventListener("change", renderVenues);
$("#discoverCitySearch").addEventListener("input", (e) => {
  discoverCityQuery = e.target.value;
  const cities = citiesFor((p) => kindOf(p) === "sight" && (discoverCountry === "all" || countryOf(p) === discoverCountry));
  $("#discoverCities").innerHTML = cityChips(cities, state.city, discoverCityQuery);
});
$("#venueCitySearch").addEventListener("input", (e) => {
  venueCityQuery = e.target.value;
  const cities = citiesFor((p) => kindOf(p) === "venue" && (venueCountry === "all" || countryOf(p) === venueCountry));
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
  renderHistory();
  renderRegionFilter();
  renderHero(); renderDirections(); renderDiscover(); renderVenues();
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
