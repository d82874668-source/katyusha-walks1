import { loadData, setFavorite } from "./store.js";
import { state } from "./state.js";
import { CATEGORIES } from "./data.js";
import { MapView, googleUrl, osmUrl, haversineKm, fmtDist, fmtDur } from "./map.js";
import { visitDialog } from "./visits.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = p => p.price_min == null ? "" : Number(p.price_min) === 0 ? "Бесплатно" : "от " + Number(p.price_min).toLocaleString("ru-RU") + " " + (p.price_unit || "");
const cityOf = p => p.city || p.region || "Другой город";
const placeImage = p => p.image || (Array.isArray(p.photos) && p.photos[0]?.url) || "";
const categoryName = p => CATEGORIES[p.category]?.title || "Место";
let mapView = null, selectedCity = "Баку", searchText = "", selectedCategory = "all", sortMode = "rating", visibleLimit = 12, mapSearch = "";

function toast(message) {
  const el = $("#app-toast"); if (!el) return;
  el.textContent = message; el.classList.add("is-visible");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("is-visible"), 2600);
}
function cities() {
  return [...new Set(state.places.map(cityOf).filter(Boolean))].sort((a,b) => a.localeCompare(b,"ru"));
}
function currentPlaces() {
  return state.places.filter(p => selectedCity === "all" || cityOf(p) === selectedCity);
}
function matches(p) {
  const q = searchText.trim().toLocaleLowerCase("ru");
  const text = [p.title,p.description,p.address,cityOf(p),categoryName(p)].join(" ").toLocaleLowerCase("ru");
  return (!q || text.includes(q)) && (selectedCategory === "all" || p.category === selectedCategory);
}
function filteredPlaces() {
  const arr = currentPlaces().filter(matches);
  if (sortMode === "name") arr.sort((a,b) => a.title.localeCompare(b.title,"ru"));
  else if (sortMode === "price") arr.sort((a,b) => (a.price_min ?? Infinity) - (b.price_min ?? Infinity));
  else arr.sort((a,b) => (Number(b.rating)||0) - (Number(a.rating)||0));
  return arr;
}
function card(p, compact = false) {
  const image = placeImage(p), fav = state.favs.has(p.id);
  return `<article class="place-card bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm flex flex-col">
    <div class="relative h-52 overflow-hidden bg-surface-container-low">${image ? `<img src="${esc(image)}" alt="${esc(p.title)}" loading="lazy" class="w-full h-full object-cover transition-transform duration-500 hover:scale-105">` : `<div class="w-full h-full flex items-center justify-center text-primary/40"><span class="material-symbols-outlined text-5xl">${esc(CATEGORIES[p.category]?.icon || "place")}</span></div>`}
      <span class="absolute top-3 left-3 px-3 py-1 rounded-full bg-surface-bright/95 text-primary text-xs font-semibold">${esc(categoryName(p))}</span>
      <button type="button" class="absolute top-3 right-3 w-10 h-10 rounded-full bg-surface-bright/95 text-secondary text-xl" data-favorite="${esc(p.id)}" aria-label="Избранное">${fav ? "♥" : "♡"}</button>
    </div>
    <div class="p-space-md flex flex-col flex-1">
      <div class="flex items-center justify-between gap-2 text-xs text-on-surface-variant"><span>${esc(cityOf(p))}</span><span>${p.rating ? "★ " + esc(p.rating) : "Новый объект"}</span></div>
      <h3 class="font-headline-md text-primary mt-2">${esc(p.title)}</h3>
      <p class="text-sm text-on-surface-variant mt-2 line-clamp-3">${esc(p.description || "Описание скоро появится.")}</p>
      <p class="text-xs text-on-surface-variant mt-3">${esc(p.address || "Адрес уточняется")}</p>
      ${p.is_approx ? '<p class="text-xs text-secondary mt-1">Точка на карте ориентировочная</p>' : ""}
      <div class="mt-auto pt-4 flex items-center justify-between gap-2"><span class="text-sm font-semibold text-primary">${esc(money(p))}</span><button class="text-sm font-semibold text-secondary" type="button" data-open-place="${esc(p.id)}">Подробнее →</button></div>
      <div class="grid grid-cols-2 gap-2 mt-3"><button class="px-3 py-2 rounded-full bg-primary-container text-on-primary text-sm" data-add-plan="${esc(p.id)}">＋ В маршрут</button><button class="px-3 py-2 rounded-full bg-surface-container-low text-sm" data-visit="${esc(p.id)}">Были здесь</button></div>
    </div>
  </article>`;
}
function renderCities() {
  const all = cities(), target = $("#city-grid");
  $("#city-total").textContent = all.length + " городов · " + state.places.length + " мест";
  target.innerHTML = all.map((city, i) => {
    const list = state.places.filter(p => cityOf(p) === city), cover = list.find(p => placeImage(p));
    return `<button class="city-card group text-left bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm" data-city-pick="${esc(city)}">
      <div class="relative h-48 bg-surface-container-low overflow-hidden">${cover ? `<img src="${esc(placeImage(cover))}" alt="${esc(city)}" loading="lazy" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">` : '<div class="w-full h-full flex items-center justify-center text-primary/40"><span class="material-symbols-outlined text-5xl">location_city</span></div>'}
      <div class="absolute inset-0 bg-gradient-to-t from-primary/70 to-transparent"></div><h3 class="absolute bottom-4 left-4 text-on-primary font-headline-md">${esc(city)}</h3></div>
      <div class="p-space-md flex items-center justify-between"><span class="text-sm text-on-surface-variant">${list.length} мест в каталоге</span><span class="text-secondary font-semibold">Исследовать →</span></div>
    </button>`;
  }).join("");
}
function renderFilters() {
  const allCities = cities(), citySel = $("#city-filter"), heroSel = $("#hero-city-select"), idealSel = $("#ideal-city");
  const opts = allCities.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  citySel.innerHTML = '<option value="all">Все города</option>' + opts;
  heroSel.innerHTML = opts; idealSel.innerHTML = opts;
  [citySel,heroSel,idealSel].forEach(el => { if (el) el.value = allCities.includes(selectedCity) ? selectedCity : allCities[0]; });
  const categories = [...new Set(state.places.map(p => p.category).filter(Boolean))].sort((a,b) => categoryName({category:a}).localeCompare(categoryName({category:b}),"ru"));
  $("#category-filter").innerHTML = '<option value="all">Все категории</option>' + categories.map(c => `<option value="${esc(c)}">${esc(categoryName({category:c}))}</option>`).join("");
  $("#category-chips").innerHTML = '<button class="filter-chip is-active" data-category="all">Все места</button>' + categories.slice(0,14).map(c => `<button class="filter-chip" data-category="${esc(c)}">${esc(categoryName({category:c}))}</button>`).join("");
}
function renderCatalog() {
  const list = filteredPlaces(), shown = list.slice(0, visibleLimit);
  $("#places-total").textContent = list.length + " мест найдено";
  $("#places-grid").innerHTML = shown.length ? shown.map(p => card(p)).join("") : '<p class="col-span-full py-12 text-center text-on-surface-variant">Ничего не найдено. Измени город или фильтр.</p>';
  $("#load-more").hidden = shown.length >= list.length;
}
function renderMapList() {
  const q = mapSearch.trim().toLocaleLowerCase("ru");
  const list = currentPlaces().filter(p => !q || [p.title,p.address,cityOf(p)].join(" ").toLocaleLowerCase("ru").includes(q));
  $("#map-place-list").innerHTML = list.slice(0,80).map(p => `<button class="map-place-row w-full text-left p-3 rounded-lg bg-surface-container-low hover:bg-surface-container flex gap-3 items-center" data-map-place="${esc(p.id)}"><span class="w-2.5 h-2.5 rounded-full flex-shrink-0 ${p.is_approx ? "bg-secondary" : "bg-primary"}"></span><span class="min-w-0"><strong class="block text-sm text-primary truncate">${esc(p.title)}</strong><small class="block text-xs text-on-surface-variant truncate">${esc(p.address || "Адрес уточняется")}</small></span></button>`).join("");
}
function renderRoutes() {
  $("#routes-total").textContent = state.routes.length + " маршрутов";
  $("#routes-grid").innerHTML = state.routes.map(r => {
    const places = (r.places || []).map(id => state.places.find(p => String(p.id) === String(id))).filter(Boolean);
    const first = places.find(p => placeImage(p));
    return `<article class="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm flex flex-col">
      <div class="h-44 bg-surface-container-low overflow-hidden">${first && placeImage(first) ? `<img class="w-full h-full object-cover" src="${esc(placeImage(first))}" alt="${esc(r.title)}" loading="lazy">` : '<div class="h-full flex items-center justify-center text-primary/40"><span class="material-symbols-outlined text-5xl">route</span></div>'}</div>
      <div class="p-space-md flex-1"><span class="text-xs uppercase tracking-widest text-secondary">Маршрут</span><h3 class="font-headline-md text-primary mt-2">${esc(r.title)}</h3><p class="text-sm text-on-surface-variant mt-2">${esc(r.description || "")}</p><p class="text-xs text-on-surface-variant mt-3">${places.length} остановок</p><div class="flex flex-wrap gap-1 mt-3">${places.slice(0,4).map(p => `<span class="text-xs px-2 py-1 rounded-full bg-surface-container-low">${esc(p.title)}</span>`).join("")}</div></div>
      <div class="p-space-md pt-0"><button class="w-full px-4 py-2.5 rounded-full bg-primary-container text-on-primary font-semibold" data-load-route="${esc(r.id)}">Загрузить в конструктор</button></div>
    </article>`;
  }).join("");
}
function renderPlan() {
  const ids = state.plan.ids || [];
  const places = ids.map(id => state.places.find(p => String(p.id) === String(id))).filter(Boolean);
  $("#plan-stops").innerHTML = places.length ? places.map((p,i) => `<div class="plan-stop flex items-center gap-3 p-3 rounded-lg bg-surface-container-low"><span class="w-8 h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center text-sm">${i+1}</span><div class="min-w-0 flex-1"><strong class="block text-primary">${esc(p.title)}</strong><small class="text-xs text-on-surface-variant">${esc(cityOf(p))} · ${esc(p.address || "адрес уточняется")}</small></div><div class="flex gap-1"><button class="p-2" data-plan-up="${i}" aria-label="Выше">↑</button><button class="p-2" data-plan-down="${i}" aria-label="Ниже">↓</button><button class="p-2 text-secondary" data-plan-remove="${i}" aria-label="Удалить">×</button></div></div>`).join("") : '<p class="text-on-surface-variant text-sm py-4">Пока нет остановок. Добавьте места из каталога или выберите готовый маршрут.</p>';
  let km = 0; for (let i=1;i<places.length;i++) km += haversineKm(places[i-1],places[i]);
  $("#plan-totals").textContent = places.length + " остановок" + (places.length > 1 ? " · около " + fmtDist(km) : "");
  $("#plan-mode-walk").className = state.plan.mode === "walk" ? "px-3 py-2 rounded-full bg-primary-container text-on-primary text-sm" : "px-3 py-2 rounded-full bg-surface-container-low text-sm";
  $("#plan-mode-drive").className = state.plan.mode === "drive" ? "px-3 py-2 rounded-full bg-primary-container text-on-primary text-sm" : "px-3 py-2 rounded-full bg-surface-container-low text-sm";
  $("#plan-name").value = state.plan.name || "Моя прогулка";
  const valid = places.filter(p => Number.isFinite(+p.latitude) && Number.isFinite(+p.longitude) && !p.is_approx);
  $("#plan-open-map").disabled = valid.length < 2;
}
function renderFavorites() {
  const list = state.places.filter(p => state.favs.has(p.id) || state.favs.has(String(p.id)));
  $("#fav-count").textContent = list.length;
  $("#favorites-total").textContent = list.length + " сохранено";
  $("#favorites-grid").innerHTML = list.length ? list.map(p => card(p,true)).join("") : '<p class="col-span-full py-12 text-center text-on-surface-variant">Пока нет избранных мест. Нажми на сердечко в карточке, чтобы сохранить.</p>';
}
function renderFeatured() {
  const p = state.places.find(x => cityOf(x) === selectedCity && placeImage(x)) || state.places.find(x => placeImage(x));
  if (!p) { $("#hero-featured").innerHTML = '<div class="p-space-lg">Каталог загружается…</div>'; return; }
  $("#hero-featured").innerHTML = `<div class="h-56 overflow-hidden bg-surface-container-low"><img src="${esc(placeImage(p))}" alt="${esc(p.title)}" class="w-full h-full object-cover" loading="lazy"></div><div class="p-space-lg"><span class="text-xs uppercase tracking-widest text-secondary">Место из каталога</span><h2 class="font-headline-md text-primary mt-2">${esc(p.title)}</h2><p class="text-sm text-on-surface-variant mt-2">${esc(p.description || "")}</p><p class="text-xs text-on-surface-variant mt-3">${esc(cityOf(p))} · ${esc(p.address || "Адрес уточняется")}</p><button class="mt-4 text-secondary font-semibold" data-open-place="${esc(p.id)}">Открыть карточку →</button></div>`;
}
function openPlace(id) {
  const p = state.places.find(x => String(x.id) === String(id)); if (!p) return;
  const image = placeImage(p);
  $("#place-detail-content").innerHTML = `<div class="bg-surface-container-low rounded-xl overflow-hidden mb-4">${image ? `<img src="${esc(image)}" alt="${esc(p.title)}" class="w-full max-h-72 object-cover">` : '<div class="h-36 flex items-center justify-center"><span class="material-symbols-outlined text-5xl">place</span></div>'}</div><span class="text-xs uppercase tracking-widest text-secondary">${esc(categoryName(p))} · ${esc(cityOf(p))}</span><h2 id="detail-title" class="font-headline-xl text-primary mt-2">${esc(p.title)}</h2><p class="text-sm text-on-surface-variant mt-3">${esc(p.description || "")}</p><p class="mt-4 text-sm"><strong>Адрес:</strong> ${esc(p.address || "Уточняется")}</p>${p.is_approx ? '<p class="text-sm text-secondary mt-1">На карте показана ориентировочная точка, а не точный вход.</p>' : ""}<p class="mt-2 text-sm"><strong>Время работы:</strong> ${esc(p.opening_hours || "Нет подтверждённых данных")}</p><p class="mt-2 text-sm"><strong>Стоимость:</strong> ${esc(money(p) || "Не указана")}</p>${p.phone ? `<p class="mt-2 text-sm"><strong>Телефон:</strong> <a href="tel:${esc(p.phone)}" class="text-secondary">${esc(p.phone)}</a></p>` : ""}<div class="flex flex-wrap gap-2 mt-5"><button class="px-4 py-2 rounded-full bg-primary-container text-on-primary" data-add-plan="${esc(p.id)}">＋ В маршрут</button><button class="px-4 py-2 rounded-full bg-surface-container-low" data-favorite="${esc(p.id)}">♡ Избранное</button><button class="px-4 py-2 rounded-full bg-surface-container-low" data-visit="${esc(p.id)}">Были здесь</button><a class="px-4 py-2 rounded-full bg-surface-container-low" href="${esc(p.map_url || googleUrl(p))}" target="_blank" rel="noopener">Открыть карту ↗</a>${p.website ? `<a class="px-4 py-2 rounded-full bg-surface-container-low" href="${esc(p.website)}" target="_blank" rel="noopener">Сайт ↗</a>` : ""}</div>`;
  $("#place-dialog").classList.add("is-open"); $("#place-dialog").setAttribute("aria-hidden","false"); document.body.classList.add("dialog-open");
  if (mapView && Number.isFinite(+p.latitude) && Number.isFinite(+p.longitude)) { $("#interactive-map").scrollIntoView({behavior:"smooth"}); setTimeout(() => mapView.focus(p), 450); }
}
function closeDialog() { $("#place-dialog").classList.remove("is-open"); $("#place-dialog").setAttribute("aria-hidden","true"); document.body.classList.remove("dialog-open"); }
function addToPlan(id) {
  const p = state.places.find(x => String(x.id) === String(id)); if (!p) return;
  if (state.plan.ids.some(x => String(x) === String(p.id))) return toast("Это место уже в маршруте");
  state.plan.ids.push(p.id); savePlan(); renderPlan(); toast("Добавлено в маршрут");
}
function savePlan() { try { localStorage.setItem("rfn:plan", JSON.stringify(state.plan)); } catch {} }
function loadSavedPlan() { try { const v = JSON.parse(localStorage.getItem("rfn:plan") || "null"); if (v && Array.isArray(v.ids)) state.plan = {...state.plan,...v}; } catch {} }
function buildIdeal() {
  const city = $("#ideal-city").value, mood = $("#ideal-mood").value, hours = +$("#ideal-hours").value, budget = +$("#ideal-budget").value || Infinity;
  const interests = $$("#ideal-interests input:checked").map(x => x.value);
  const base = state.places.filter(p => cityOf(p) === city && (p.price_min == null || +p.price_min <= budget));
  const score = p => {
    let s = 0;
    const category = p.category || "";
    if (interests.includes("sight") && ["attraction","historic","monument","museum","city","viewpoint","square","embankment"].includes(category)) s += 5;
    if (interests.includes("food") && ["restaurant","cafe","coffee","bakery","fastfood","bar"].includes(category)) s += 5;
    if (interests.includes("nature") && ["park","garden","nature","beach","sea","recreation"].includes(category)) s += 5;
    if (interests.includes("spa") && ["spa","bath","thermal","massage","resort"].includes(category)) s += 5;
    if (interests.includes("fun") && ["gaming","capybara","karting","cinema","entertainment","quest"].includes(category)) s += 5;
    if (mood === "romantic" && ["restaurant","coffee","viewpoint","sea","spa"].includes(category)) s += 2;
    if (mood === "calm" && ["park","garden","spa","museum","coffee"].includes(category)) s += 2;
    if (mood === "culture" && ["museum","historic","monument","attraction","city"].includes(category)) s += 2;
    if (mood === "active" && ["gaming","karting","recreation","beach","nature"].includes(category)) s += 2;
    if (mood === "family" && ["capybara","park","zoo","aquapark","entertainment"].includes(category)) s += 2;
    return s + (Number(p.rating)||0)/10;
  };
  const picks = base.map(p => ({p,s:score(p)})).filter(x => x.s > 0).sort((a,b) => b.s-a.s).slice(0, Math.max(2,Math.min(6,Math.round(hours/1.5))));
  $("#ideal-results").innerHTML = picks.length ? `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-space-md">${picks.map(x => card(x.p)).join("")}</div><div class="mt-4 flex justify-end"><button id="ideal-to-plan" class="px-5 py-3 rounded-full bg-primary-container text-on-primary">Перенести в конструктор</button></div>` : '<p class="p-6 bg-surface-container-lowest rounded-xl">По этим условиям мест пока не нашлось. Попробуйте изменить интересы или бюджет.</p>';
  $("#ideal-to-plan")?.addEventListener("click", () => { state.plan.ids = picks.map(x => x.p.id); state.plan.name = "Идеальный день · " + city; savePlan(); renderPlan(); $("#planner-builder").scrollIntoView({behavior:"smooth"}); });
}
function refreshMap() {
  if (!mapView) return;
  const places = currentPlaces().filter(p => Number.isFinite(+p.latitude) && Number.isFinite(+p.longitude));
  mapView.setPlaces(places, true);
  renderMapList();
}
function bind() {
  $("#place-search").addEventListener("input", e => { searchText=e.target.value; visibleLimit=12; renderCatalog(); });
  $("#city-filter").addEventListener("change", e => { selectedCity=e.target.value; $("#header-city-name").textContent=selectedCity==="all"?"Все города":selectedCity; renderCatalog(); renderFeatured(); refreshMap(); });
  $("#category-filter").addEventListener("change", e => { selectedCategory=e.target.value; renderCatalog(); });
  $("#sort-filter").addEventListener("change", e => { sortMode=e.target.value; renderCatalog(); });
  $("#category-chips").addEventListener("click", e => { const b=e.target.closest("[data-category]"); if(!b)return; selectedCategory=b.dataset.category; $("#category-filter").value=selectedCategory; $$(".filter-chip").forEach(x=>x.classList.toggle("is-active",x===b)); renderCatalog(); });
  $("#load-more").addEventListener("click", () => { visibleLimit += 12; renderCatalog(); });
  $("#map-search").addEventListener("input", e => { mapSearch=e.target.value; renderMapList(); });
  $("#map-clear").addEventListener("click", () => { $("#map-search").value=""; mapSearch=""; renderMapList(); });
  $("#map-fit").addEventListener("click", () => refreshMap());
  $("#map-locate").addEventListener("click", async () => { try { const p=await mapView.locate(); mapView.map.setView([p.latitude,p.longitude],14); } catch(e) { toast(e.message); } });
  $("#header-search-btn").addEventListener("click", () => { $("#places-section").scrollIntoView({behavior:"smooth"}); setTimeout(()=>$("#place-search").focus(),400); });
  $("#hero-city-select").addEventListener("change", e => { selectedCity=e.target.value; $("#city-filter").value=selectedCity; $("#ideal-city").value=selectedCity; $("#header-city-name").textContent=selectedCity; renderCatalog(); renderFeatured(); refreshMap(); });
  $("#hero-create-route").addEventListener("click", () => { $("#ideal-city").value=$("#hero-city-select").value; $("#ideal-mood").value=$("#hero-type-select").value==="coffee"?"calm":$("#hero-type-select").value==="architecture"?"culture":$("#hero-type-select").value; $("#ideal-hours").value=$("#hero-duration-select").value; $("#ideal-form").requestSubmit(); $("#ideal-section").scrollIntoView({behavior:"smooth"}); });
  $("#ideal-form").addEventListener("submit", e => { e.preventDefault(); buildIdeal(); });
  $("#plan-name").addEventListener("input", e => { state.plan.name=e.target.value; savePlan(); });
  $("#plan-mode-walk").addEventListener("click", () => { state.plan.mode="walk"; savePlan(); renderPlan(); });
  $("#plan-mode-drive").addEventListener("click", () => { state.plan.mode="drive"; savePlan(); renderPlan(); });
  $("#plan-clear").addEventListener("click", () => { state.plan.ids=[]; savePlan(); renderPlan(); });
  $("#plan-save").addEventListener("click", () => { const saved=JSON.parse(localStorage.getItem("katyusha:saved-routes")||"[]"); saved.push({id:Date.now(),name:state.plan.name||"Моя прогулка",ids:[...state.plan.ids],mode:state.plan.mode}); localStorage.setItem("katyusha:saved-routes",JSON.stringify(saved)); toast("Маршрут сохранён на этом устройстве"); });
  $("#plan-share").addEventListener("click", async () => { const url=new URL(location.href); url.searchParams.set("plan",state.plan.ids.join(",")); try { await navigator.clipboard.writeText(url.toString()); toast("Ссылка скопирована"); } catch { toast(url.toString()); } });
  $("#plan-open-map").addEventListener("click", async () => { const pts=state.plan.ids.map(id=>state.places.find(p=>String(p.id)===String(id))).filter(p=>p && Number.isFinite(+p.latitude)&&Number.isFinite(+p.longitude)&&!p.is_approx); if(pts.length<2)return toast("Для построения точного маршрута нужны минимум две точные точки"); $("#interactive-map").scrollIntoView({behavior:"smooth"}); setTimeout(()=>mapView.drawRoute(pts,state.plan.mode),450); });
  document.addEventListener("click", async e => {
    const fav=e.target.closest("[data-favorite]"); if(fav){const id=fav.dataset.favorite,p=state.places.find(x=>String(x.id)===String(id)); if(p){await setFavorite(p.id,!state.favs.has(p.id),state.favs); renderCatalog();renderFavorites();renderFeatured();}return;}
    const add=e.target.closest("[data-add-plan]"); if(add){addToPlan(add.dataset.addPlan);return;}
    const open=e.target.closest("[data-open-place]"); if(open){openPlace(open.dataset.openPlace);return;}
    const visit=e.target.closest("[data-visit]"); if(visit){const p=state.places.find(x=>String(x.id)===String(visit.dataset.visit));if(p)visitDialog(p);return;}
    const city=e.target.closest("[data-city-pick]"); if(city){selectedCity=city.dataset.cityPick;$("#city-filter").value=selectedCity;$("#hero-city-select").value=selectedCity;$("#ideal-city").value=selectedCity;$("#header-city-name").textContent=selectedCity;renderCatalog();renderFeatured();refreshMap();$("#places-section").scrollIntoView({behavior:"smooth"});return;}
    const mapPlace=e.target.closest("[data-map-place]"); if(mapPlace){const p=state.places.find(x=>String(x.id)===String(mapPlace.dataset.mapPlace));if(p){openPlace(p.id);mapView.focus(p);}return;}
    const load=e.target.closest("[data-load-route]"); if(load){const r=state.routes.find(x=>String(x.id)===String(load.dataset.loadRoute));if(r){state.plan.ids=[...(r.places||[])].filter(id=>state.places.some(p=>String(p.id)===String(id)));state.plan.name=r.title;savePlan();renderPlan();$("#planner-builder").scrollIntoView({behavior:"smooth"});}return;}
    const remove=e.target.closest("[data-plan-remove]"); if(remove){state.plan.ids.splice(+remove.dataset.planRemove,1);savePlan();renderPlan();return;}
    const up=e.target.closest("[data-plan-up]"); if(up){const i=+up.dataset.planUp;if(i>0){[state.plan.ids[i-1],state.plan.ids[i]]=[state.plan.ids[i],state.plan.ids[i-1]];savePlan();renderPlan();}return;}
    const down=e.target.closest("[data-plan-down]"); if(down){const i=+down.dataset.planDown;if(i<state.plan.ids.length-1){[state.plan.ids[i+1],state.plan.ids[i]]=[state.plan.ids[i],state.plan.ids[i+1]];savePlan();renderPlan();}return;}
    if(e.target.closest("[data-dialog-close]"))closeDialog();
  });
  document.addEventListener("keydown", e=>{if(e.key==="Escape")closeDialog();});
}
async function init() {
  const data=await loadData();
  state.places=data.places||[]; state.routes=data.routes||[]; state.favs=data.favs||new Set(); state.mode=data.mode||"local";
  loadSavedPlan();
  const allCities=cities(); if(!allCities.includes(selectedCity)) selectedCity=allCities.includes("Баку")?"Баку":allCities[0]||"all";
  renderFilters(); renderCities(); renderFeatured(); renderCatalog(); renderRoutes(); renderPlan(); renderFavorites();
  mapView=new MapView($("#mapCanvas"), id=>openPlace(id));
  refreshMap();
  bind();
  const params=new URLSearchParams(location.search);
  if(params.has("plan")){state.plan.ids=params.get("plan").split(",").filter(Boolean).map(x=>state.places.find(p=>String(p.id)===x)?.id).filter(x=>x!=null);savePlan();renderPlan();$("#planner-builder").scrollIntoView();}
  if("scrollRestoration" in history)history.scrollRestoration="manual";
  if(!params.has("plan")){window.scrollTo(0,0);}
}
init().catch(error=>{console.error(error);toast("Не удалось загрузить каталог. Обновите страницу.");});
