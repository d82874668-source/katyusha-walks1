// Точка входа: рендер секций, навигация, взаимодействие с картой.
import { CATEGORIES } from "./data.js";
import { loadData, setFavorite, subscribeFavorites } from "./store.js";
import { MapView, CENTER, googleUrl, osmUrl, route, fmtDist, fmtDur } from "./map.js";
import { state, byId } from "./state.js";
import { $, $$, icon, esc, telUrl, cat, priceText, placeCard, toast } from "./ui.js";
import { kindOf, groupOf, VENUE_GROUPS } from "./taxonomy.js";
import { initPlanner, addToPlan } from "./planner.js";
import { initIdeal, refreshIdeal } from "./ideal.js";
import { initPWA } from "./pwa.js";
import { visitDialog, visitHistoryHtml, getVisits, deleteVisit, syncPendingVisits, hydrateVisits } from "./visits.js";

const safeWebHref = (value) => typeof value === "string" && /^https?:\/\//i.test(value) ? esc(value) : "";
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
// Карта создаётся лениво: при первом обращении или когда секция приближается к экрану.
const ensureMap = () => {
  if (!mapView) { mapView = new MapView($("#mapCanvas"), (id) => openPlace(id)); mapView.setPlaces(visible()); }
  return mapView;
};

/* ---------- Тема ---------- */
const themeBtn = $("#themeBtn");
const THEMES = {
  light:  { name: "Светлая", note: "Чистый светлый фон", bg: "#F5F6FA", s: "#FFFFFF", i: "#0F1522", l: "rgba(15,21,34,.14)", a: "#D8365C", ai: "#FFFFFF", meta: "#F5F6FA" },
  dark:   { name: "Тёмная", note: "Комфортно вечером", bg: "#0A0E17", s: "#121826", i: "#EEF1F8", l: "rgba(238,241,248,.18)", a: "#FF5C80", ai: "#1A0A10", meta: "#0A0E17" },
  hearts: { name: "Сердечки", note: "Нежный розовый фон", bg: "#FFF7FA", s: "#FFFFFF", i: "#3A1725", l: "rgba(120,48,72,.18)", a: "#C2305F", ai: "#FFFFFF", meta: "#FFF7FA" },
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
      (state.region === "all" || (p.city || p.region || "Баку") === state.region) &&
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

function renderChips() {
  const used = Object.keys(CATEGORIES).filter((k) => state.places.some((p) => p.category === k));
  $("#chips").innerHTML = [["all", "Все"], ...used.map((k) => [k, CATEGORIES[k].title])]
    .map(([k, t]) => `<button class="chip" role="tab" aria-selected="${state.filter === k}" data-cat="${k}">${esc(t)}</button>`).join("");
}

function renderList() {
  const list = visible();
  $("#placeList").innerHTML = list.length ? list.map((p) => {
    const c = cat(p);
    return `<li><div class="row ${state.active === p.id ? "is-active" : ""}" data-place="${p.id}" role="button" tabindex="0">
      <span class="badge" style="--h:${c.hue}">${icon(c.icon)}</span>
      <span class="row__t"><strong>${esc(p.title)}</strong><small>${esc(c.title)}</small><small>${p.address ? esc(p.address) : "Адрес уточняется"}${p.is_approx ? " · точка ориентировочная" : ""}</small></span>
      ${favBtn(p)}</div></li>`;
  }).join("") : `<li class="empty">Ничего не найдено. Сбросьте фильтр или измените запрос.</li>`;
}

function applyFilter(fit = true) {
  const list = visible();
  renderChips(); renderList();
  mapView?.setPlaces(list, fit);
  if (state.active && !list.some((p) => p.id === state.active)) closeSheet();
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
    if (state.active !== id) return;
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
    ${p.image ? `<img class="sheet__img" src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy">` : ""}
    ${p.photos?.length ? `<div class="sheet__gallery">${p.photos.map((photo) => `<img class="sheet__img" src="${esc(photo.url)}" alt="${esc(p.title)}" loading="lazy">`).join("")}</div>` : ""}
    <p class="sheet__desc">${esc(p.description)}</p>
    <p class="muted">${p.address ? `${esc(p.address)}${p.city ? ` · ${esc(p.city)}` : ""}${p.country ? ` · ${esc(p.country)}` : ""}` : `Адрес для этого места пока не подтверждён${p.city ? ` · ${esc(p.city)}` : ""}. Проверьте расположение перед поездкой.`}</p>
    ${p.website ? `<p class="muted"><a href="${safeWebHref(p.website)}" target="_blank" rel="noopener">Официальный сайт</a></p>` : ""}
    ${p.social_links && Object.keys(p.social_links).length ? `<p class="muted">${Object.entries(p.social_links).filter(([,url]) => typeof url === "string" && /^https?:\/\//i.test(url)).map(([name,url]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>`).join(" · ")}</p>` : ""}
    ${p.opening_hours ? `<p class="muted">Часы работы: ${esc(p.opening_hours)}</p>` : ""}
    ${p.phone ? `<p class="muted"><a href="${esc(telUrl(p.phone))}">${esc(p.phone)}</a></p>` : ""}
    ${price ? `<p class="muted">Стоимость: ${esc(price)}</p>` : ""}
    ${p.review_count != null ? `<p class="muted">${Number(p.review_count).toLocaleString("ru-RU")} отзывов${p.rating_source ? ` · источник: ${esc(p.rating_source)}` : ""}</p>` : ""}
    ${p.last_verified_at ? `<p class="muted">Последняя проверка: ${new Date(p.last_verified_at).toLocaleDateString("ru-RU")}</p>` : ""}
    ${p.features && Object.keys(p.features).length ? `<p class="muted">${Object.entries(p.features).map(([key,value]) => `${esc(key)}: ${esc(typeof value === "object" ? JSON.stringify(value) : value)}`).join(" · ")}</p>` : ""}
    ${Array.isArray(p.additional_services) && p.additional_services.length ? `<p class="muted">Услуги: ${p.additional_services.map(esc).join(", ")}</p>` : ""}
    ${p.source_urls?.[0] ? `<p class="muted"><a href="${safeWebHref(p.source_urls[0])}" target="_blank" rel="noopener">Источник информации</a></p>` : ""}
    ${p.photo_sources?.[0] ? `<p class="muted">Фото: ${esc(p.photo_sources[0].attribution || "автор не указан")} · ${esc(p.photo_sources[0].license || "лицензия указана на странице источника")} · <a href="${safeWebHref(p.photo_sources[0].source_url)}" target="_blank" rel="noopener">условия использования</a></p>` : ""}
    ${p.is_approx ? `<p class="note">Метка показывает ориентировочную область, а не подтверждённый вход. Уточните точный адрес перед поездкой.</p>` : ""}
    <p class="eta" id="eta">${icon("route")}<span>Считаем маршрут…</span></p>
    <div class="sheet__actions">
      <button class="btn btn--primary" data-visit-place="${p.id}">Были здесь${getVisits(p.id).length ? ` · ${getVisits(p.id).length}` : ""}</button>
      <a class="btn btn--primary" target="_blank" rel="noopener" href="${googleUrl(p, state.user)}">${icon("nav")}Построить маршрут</a>
      <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.title, p.address, p.city, p.region].filter(Boolean).join(", "))}">Проверить адрес</a>
      <a class="btn" target="_blank" rel="noopener" href="${osmUrl([state.user || cityOrigin(p), p])}">OpenStreetMap</a>
      ${p.map_url ? `<a class="btn" target="_blank" rel="noopener" href="${safeWebHref(p.map_url)}">Открыть карточку на карте</a>` : ""}
      <button class="btn" data-plan-add="${p.id}">${icon("plus")}В маршрут</button>
      ${favBtn(p, "icon-btn--lg")}
    </div>
    ${visitHistoryHtml(p.id)}`;
}

/* ---------- Направления: «Открой город» и «Куда сходить» ---------- */
const citiesFor = (pred) => {
  const m = new Map();
  state.places.filter(pred).forEach((p) => p.city && m.set(p.city, (m.get(p.city) || 0) + 1));
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
};
const cityChips = (list, active) => list.map(([c, n]) =>
  `<button class="chip" role="tab" aria-selected="${c === active}" data-city="${esc(c)}">${esc(c)} <small>${n}</small></button>`).join("");
const byQuality = (a, b) => (Number(b.rating || 0) - Number(a.rating || 0)) || (Number(b.review_count || 0) - Number(a.review_count || 0)) || (!!b.image - !!a.image) || String(a.title).localeCompare(String(b.title), "ru");

function renderDiscover() {
  const sights = citiesFor((p) => kindOf(p) === "sight");
  if (!sights.some(([c]) => c === state.city)) state.city = sights[0]?.[0] || state.city;
  $("#discoverCities").innerHTML = cityChips(sights, state.city);
  const items = state.places.filter((p) => kindOf(p) === "sight" && p.city === state.city).sort(byQuality);
  $("#discoverGrid").innerHTML = items.length
    ? items.map((p, i) => placeCard(p, favBtn, { large: i < 2 && items.length > 3 })).join("")
    : `<div class="card empty"><p>Для этого города достопримечательностей пока нет в каталоге.</p></div>`;
}

function renderVenues() {
  const cities = citiesFor((p) => kindOf(p) === "venue");
  if (!cities.some(([c]) => c === state.venueCity) && cities.length) state.venueCity = cities[0][0];
  $("#venueCities").innerHTML = cityChips(cities, state.venueCity);
  const inCity = state.places.filter((p) => kindOf(p) === "venue" && p.city === state.venueCity);
  // Показываем все группы из задачи: пустые приглушены, так видно, чего в каталоге ещё нет
  const groups = VENUE_GROUPS.map((g) => [g, inCity.filter((p) => g.cats.includes(p.category)).length]);
  $("#venueGroups").innerHTML = [`<button class="chip" role="tab" aria-selected="${state.venueGroup === "all"}" data-vgroup="all">Все <small>${inCity.length}</small></button>`,
    ...groups.map(([g, n]) => `<button class="chip ${n ? "" : "is-empty"}" role="tab" aria-selected="${state.venueGroup === g.key}" data-vgroup="${g.key}">${esc(g.title)} <small>${n}</small></button>`)].join("");
  const sort = $("#venueSort").value;
  const items = inCity.filter((p) => state.venueGroup === "all" || groupOf(p)?.key === state.venueGroup)
    .sort(sort === "price" ? (a, b) => (a.price_min ?? Infinity) - (b.price_min ?? Infinity) : sort === "popular" ? (a, b) => Number(b.review_count || 0) - Number(a.review_count || 0) : byQuality);
  $("#venueGrid").innerHTML = items.length
    ? items.map((p) => placeCard(p, favBtn)).join("")
    : `<div class="card empty"><p>В городе «${esc(state.venueCity)}» пока нет заведений в этой категории. Выберите другую категорию или город.</p></div>`;
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
  const r = state.routes.find((x) => x.id === id);
  const stops = r.places.map(byId).filter(Boolean);
  if (stops.length < 2) return;
  state.region = stops[0].city || stops[0].region || "Баку";
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
      <small class="muted">${items.length} ${items.length === 1 ? "место" : items.length < 5 ? "места" : "мест"}: ${esc(items.slice(0, 2).map((p) => p.title).join(", "))}${items.length > 2 ? "…" : ""}</small></button>`;
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
  // Коллаж собирается только из реальных фотографий каталога.
  const visual = $("#heroVisual");
  if (visual) {
    const cityPlaces = state.places.filter((p) => p.city === state.city && p.image && /^https?:\\/\\//i.test(p.image));
    const sights = cityPlaces.filter((p) => kindOf(p) === "sight");
    const featured = [...sights, ...cityPlaces.filter((p) => kindOf(p) !== "sight")].slice(0, 3);
    visual.innerHTML = featured.map((p, i) => "<figure class=\"hero__tile hero__tile--" + (i + 1) + "\"><img src=\"" + esc(p.image) + "\" alt=\"" + esc(p.title) + "\" " + (i === 0 ? "fetchpriority=\"high\"" : "loading=\"lazy\"") + "><figcaption><small>" + esc(p.city || "Место для прогулки") + "</small><strong>" + esc(p.title) + "</strong></figcaption></figure>").join("");
    visual.hidden = !featured.length;
  }
  $("#cPlaces").textContent = state.places.length;
  $("#cRoutes").textContent = state.routes.length;
  $("#cCats").textContent = new Set(state.places.map((p) => p.category)).size;
}

/* ---------- Делегирование событий ---------- */
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-fav],[data-close],[data-city],[data-vgroup],[data-cat],[data-place],[data-place-open],[data-collection],[data-show-route],[data-visit-place],[data-visit-edit],[data-visit-delete]");
  if (!t) return;
  if (t.dataset.visitDelete) { deleteVisit(t.dataset.visitDelete).then(() => { if (state.active) renderSheet(); toast("Запись о посещении удалена"); }); return; }
  if (t.dataset.visitEdit) { const place = byId(Number(t.dataset.visitPlace)); const visit = getVisits(place?.id).find((v) => v.id === t.dataset.visitEdit); if (place && visit) visitDialog(place, visit); return; }
  if (t.dataset.visitPlace) { const place = byId(Number(t.dataset.visitPlace)); if (place) visitDialog(place); return; }
  if (t.dataset.fav) { e.stopPropagation(); return toggleFav(+t.dataset.fav); }
  if (t.hasAttribute("data-close")) return closeSheet();
  if (t.dataset.city) {
    if (t.closest("#venueCities")) { state.venueCity = t.dataset.city; state.venueGroup = "all"; return renderVenues(); }
    state.city = t.dataset.city; return renderDiscover();
  }
  if (t.dataset.vgroup) { state.venueGroup = t.dataset.vgroup; return renderVenues(); }
  if (t.dataset.cat) { state.filter = t.dataset.cat; return applyFilter(); }
  if (t.dataset.place) return openPlace(+t.dataset.place);
  if (t.dataset.placeOpen) {
    const place = byId(+t.dataset.placeOpen);
    if (place?.city || place?.region) { state.region = place.city || place.region; $("#regionFilter").value = state.region; }
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
$("#heroSearchForm")?.addEventListener("submit", (e) => { e.preventDefault(); const q=$("#heroSearch").value.trim(); $("#search").value=q; state.q=q; applyFilter(); $("#map").scrollIntoView({behavior:"smooth",block:"start"}); });
$("#heroSearch")?.addEventListener("input", (e) => { const q=e.target.value; if(q.length>=2){ $("#search").value=q; state.q=q; applyFilter(); } });
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
$("#fitBtn").addEventListener("click", () => { ensureMap().clearRoute(); mapView.fit(visible()); });
$("#locateBtn").addEventListener("click", async () => {
  try {
    state.user = await ensureMap().locate();
    toast("Местоположение определено");
    mapView.map.flyTo([state.user.latitude, state.user.longitude], 13);
    if (state.active) openPlace(state.active);
  } catch (err) { toast(err.message); }
});

/* ---------- Начальная позиция страницы ---------- */
// Не позволяем браузеру восстанавливать прокрутку на секции планировщика
// при обычном открытии сайта или обновлении страницы.
// Ссылки с готовым маршрутом (?plan=...) по-прежнему откроют сам маршрут.
if (!new URLSearchParams(location.search).has("plan")) {
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  if (location.hash === "#planner") {
    history.replaceState(null, "", location.pathname + location.search);
    window.scrollTo(0, 0);
  }
}

/* ---------- Запуск ---------- */
async function init() {
  Object.assign(state, await loadData());
  renderHero(); renderDirections(); renderDiscover(); renderVenues(); renderChips(); renderList(); renderRoutes(); renderCollections(); renderFavs();
  initPlanner(); initIdeal({ favBtn });
  subscribeFavorites((favs) => { state.favs = favs; renderFavs(); renderList(); renderSheet(); renderDiscover(); renderVenues(); refreshIdeal(); });
  initPWA();
  hydrateVisits();
  syncPendingVisits();
  window.addEventListener("online", () => { hydrateVisits(); syncPendingVisits(); });
  document.addEventListener("katyusha:visits-changed", () => { if (state.active) renderSheet(); renderDiscover(); renderVenues(); });
  window.addEventListener("katyusha:toast", (e) => toast(e.detail));

  // Карта инициализируется, когда секция приближается к экрану: быстрее первая загрузка.
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); ensureMap(); } }, { rootMargin: "500px" });
  io.observe($("#map"));
}
init();
