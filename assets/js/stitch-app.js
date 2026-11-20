import { loadData, setFavorite } from "./store.js";
import { state } from "./state.js";
import { PLACES, ROUTES, CATEGORIES } from "./data.js";
import { MapView, googleUrl, osmUrl, haversineKm, fmtDist } from "./map.js";
import { visitDialog, hydrateVisits } from "./visits.js";

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const page = document.body.dataset.page || "home";
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
window.addEventListener("pageshow",()=>{if(!location.hash){window.scrollTo(0,0);requestAnimationFrame(()=>window.scrollTo(0,0));}});
const cityOf = p => p.city || p.region || "Другой город";
const imageOf = p => p.image || (Array.isArray(p.photos) ? p.photos[0]?.url : "") || "";
const categoryOf = p => CATEGORIES[p.category]?.title || "Место";
const priceOf = p => p.price_min == null ? "Стоимость не указана" : Number(p.price_min) === 0 ? "Бесплатно" : (Number(p.price_min) === Number(p.price_max) ? Number(p.price_min).toLocaleString("ru-RU") : "от " + Number(p.price_min).toLocaleString("ru-RU")) + " " + (p.price_unit || "");
let mapView = null, homeMapView = null, activeCity = "Баку", activeCategory = "all", query = "", mapQuery = "", sortMode = "rating", viewMode = "grid", plan = {ids:[],mode:"walk",name:"Моя прогулка"};

function toast(message) {
  let el = $("#stitch-toast");
  if (!el) { el=document.createElement("div"); el.id="stitch-toast"; el.className="stitch-toast"; document.body.append(el); }
  el.textContent=message; el.classList.add("is-visible");
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove("is-visible"),2600);
}
function allCities() { return [...new Set(state.places.map(cityOf).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ru")); }
function placeById(id) { return state.places.find(p=>String(p.id)===String(id)); }
function visiblePlaces() {
  let list=state.places.filter(p=>(activeCity==="all" || cityOf(p)===activeCity) && (activeCategory==="all" || p.category===activeCategory));
  if(query.trim()) { const q=query.toLocaleLowerCase("ru"); list=list.filter(p=>[p.title,p.description,p.address,cityOf(p),categoryOf(p)].join(" ").toLocaleLowerCase("ru").includes(q)); }
  if(sortMode==="name") list.sort((a,b)=>a.title.localeCompare(b.title,"ru"));
  else if(sortMode==="price") list.sort((a,b)=>(a.price_min??Infinity)-(b.price_min??Infinity));
  else list.sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0));
  return list;
}
function stitchCard(p) {
  const img=imageOf(p), fav=state.favs.has(p.id)||state.favs.has(String(p.id));
  return `<article class="group bg-surface-container-lowest rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(27,28,26,0.04)] hover:shadow-[0_12px_28px_rgba(27,28,26,0.08)] transition-all flex flex-col justify-between">
    <div><div class="relative w-full aspect-[4/3] overflow-hidden bg-surface-container-high">
      ${img?`<img alt="${esc(p.title)}" class="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500 ease-out" loading="lazy" src="${esc(img)}">`:`<div class="w-full h-full flex items-center justify-center text-primary/40"><span class="material-symbols-outlined text-5xl">${esc(CATEGORIES[p.category]?.icon||"place")}</span></div>`}
      <div class="absolute inset-0 bg-gradient-to-t from-primary/50 via-transparent to-transparent opacity-60 pointer-events-none"></div>
      <div class="absolute top-3 left-3 right-3 flex items-center justify-between gap-2"><span class="px-2.5 py-1 rounded-full bg-surface/90 backdrop-blur-md text-primary font-label-caps text-label-caps uppercase tracking-wider shadow-sm">${esc(categoryOf(p))}</span><button class="w-9 h-9 rounded-full bg-surface/95 text-secondary backdrop-blur-md flex items-center justify-center shadow-sm" data-favorite="${esc(p.id)}" aria-label="В избранное">${fav?"♥":"♡"}</button></div>
      <div class="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-primary-container/90 text-on-primary font-label-caps text-label-caps">${esc(cityOf(p))}</div>
    </div>
    <div class="p-5 space-y-3"><div class="flex flex-wrap items-center gap-2"><span class="px-2 py-0.5 rounded bg-surface-container-low text-secondary font-label-caps text-label-caps uppercase">${esc(categoryOf(p))}</span>${p.is_approx?'<span class="px-2 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-label-caps text-label-caps">Ориентир</span>':""}</div>
      <div class="space-y-1"><h3 class="font-headline-sm text-headline-sm text-primary group-hover:text-secondary transition-colors">${esc(p.title)}</h3><p class="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">location_on</span><span>${esc(p.address||"Адрес уточняется")}</span></p></div>
      <p class="font-body-md text-body-md text-on-surface-variant line-clamp-3">${esc(p.description||"Описание места уточняется.")}</p>
    </div></div>
    <div class="px-5 pb-5 pt-2 flex items-center justify-between gap-2 border-t-0 bg-surface-container-lowest"><div class="min-w-0"><div class="flex items-center text-secondary gap-1"><span class="material-symbols-outlined text-[16px]">star</span><span class="font-label-lg text-label-lg font-bold text-on-surface">${p.rating?esc(p.rating):"—"}</span></div><span class="font-body-sm text-body-sm text-outline-variant">${esc(priceOf(p))}</span></div><div class="flex items-center gap-2"><button class="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container text-primary font-label-lg text-label-lg" data-add-plan="${esc(p.id)}"><span class="material-symbols-outlined text-[16px] text-secondary">add_circle</span>В прогулку</button><a class="p-1.5 rounded-full hover:bg-surface-container text-on-surface-variant" href="place.html?id=${encodeURIComponent(p.id)}" aria-label="Открыть карточку"><span class="material-symbols-outlined text-[20px]">arrow_forward</span></a></div></div>
  </article>`;
}
function routeCard(r) {
  const stops=(r.places||[]).map(placeById).filter(Boolean), cover=stops.find(imageOf);
  return `<article class="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm flex flex-col group">
    <div class="relative h-52 overflow-hidden bg-surface-container-high">${cover&&imageOf(cover)?`<img src="${esc(imageOf(cover))}" alt="${esc(r.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy">`:'<div class="h-full flex items-center justify-center text-primary/40"><span class="material-symbols-outlined text-5xl">route</span></div>'}<div class="absolute inset-0 bg-gradient-to-t from-primary/70 to-transparent"></div><span class="absolute bottom-4 left-4 text-on-primary font-label-caps text-label-caps uppercase">${stops.length} остановок</span></div>
    <div class="p-space-lg flex-1"><h3 class="font-headline-md text-primary">${esc(r.title)}</h3><p class="font-body-md text-on-surface-variant mt-2">${esc(r.description||"Авторский маршрут по местам каталога.")}</p><div class="flex flex-wrap gap-1 mt-4">${stops.slice(0,4).map(p=>`<span class="px-2 py-1 rounded bg-surface-container-low text-xs">${esc(p.title)}</span>`).join("")}</div></div>
    <div class="px-space-lg pb-space-lg"><button class="w-full px-4 py-2.5 rounded-full bg-primary-container text-on-primary font-label-lg" data-load-route="${esc(r.id)}">Открыть маршрут</button></div>
  </article>`;
}
function cityCard(city) {
  const places=state.places.filter(p=>cityOf(p)===city), sample=places.find(imageOf);
  return `<article class="group bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm hover:shadow-[0_12px_32px_-4px_rgba(36,51,44,0.1)] transition-all flex flex-col">
    <button type="button" class="relative h-64 overflow-hidden text-left" data-city-pick="${esc(city)}">
      ${sample&&imageOf(sample)?`<img class="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105" src="${esc(imageOf(sample))}" alt="${esc(city)}" loading="lazy">`:'<div class="w-full h-full bg-surface-container-low flex items-center justify-center"><span class="material-symbols-outlined text-5xl text-primary/40">location_city</span></div>'}
      <div class="absolute inset-0 bg-gradient-to-t from-primary/70 via-transparent to-transparent"></div><span class="absolute top-4 left-4 px-3 py-1 rounded-full bg-surface-bright/90 text-primary font-label-caps text-label-caps uppercase">Город каталога</span><h3 class="absolute bottom-4 left-4 right-4 font-headline-md text-on-primary">${esc(city)}</h3>
    </button>
    <div class="p-space-lg flex-1 flex flex-col justify-between"><p class="font-body-md text-on-surface-variant mb-space-md">${places.length} реальных мест в каталоге</p><div class="pt-space-sm border-t border-surface-container flex items-center justify-between"><button class="font-label-lg text-secondary" data-city-pick="${esc(city)}">Исследовать город →</button><span class="material-symbols-outlined text-outline-variant">explore</span></div></div>
  </article>`;
}
function syncHeader() {
  const count=state.places.filter(p=>state.favs.has(p.id)||state.favs.has(String(p.id))).length;
  const header=$("header");if(header){const cityButton=[...header.querySelectorAll("button")].find(b=>/Санкт-Петербург|Баку|Москва|Екатеринбург/.test(b.textContent));if(cityButton){const spans=cityButton.querySelectorAll("span");if(spans.length>1)spans[1].textContent=activeCity;}}
  const favLink=$('a[data-path="izbrannoe"]')||$('a[href="favorites.html"]');
  if(favLink){const spans=favLink.querySelectorAll("span"); if(spans.length)spans[spans.length-1].textContent=String(count);}
  const label=$("header [data-current-city]"); if(label)label.textContent=activeCity;
}
function fillSelect(select, values, allLabel=null) {
  if(!select)return;
  const old=select.value;
  select.innerHTML=(allLabel?'<option value="all">'+esc(allLabel)+'</option>':"")+values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");
  if(values.includes(old))select.value=old;
}
function renderHome() {
  const cityGrid=$("#city-grid");
  if(cityGrid)cityGrid.innerHTML=allCities().map(cityCard).join("");
  const routeGrid=$("#routes-grid");
  if(routeGrid)routeGrid.innerHTML=state.routes.slice(0,3).map(routeCard).join("");
  const allRoutesLink=[...($("#planner-builder")?.querySelectorAll("a")||[])].find(a=>/Смотреть все/.test(a.textContent));
  if(allRoutesLink){allRoutesLink.href="routes.html";allRoutesLink.textContent="Все маршруты ("+state.routes.length+") →";}
  const heroPlannerLink=[...($("#top")?.querySelectorAll("a")||[])].find(a=>/Создать маршрут/.test(a.textContent));
  if(heroPlannerLink)heroPlannerLink.href="planner.html";
  const heroCity=$("#hero-city-select");
  fillSelect(heroCity,allCities());
  if(heroCity){if(allCities().includes(heroCity.value))activeCity=heroCity.value;else{heroCity.value=allCities().includes("Баку")?"Баку":allCities()[0]||"";activeCity=heroCity.value;}}
  const mapWrap=$("#home-map-wrap");
  if(mapWrap&&!$("#homeMapCanvas")){mapWrap.innerHTML='<div id="homeMapCanvas" class="w-full h-full min-h-[420px]"></div><a href="map.html" class="absolute bottom-4 right-4 z-[500] px-4 py-2 rounded-full bg-primary-container text-on-primary font-label-lg shadow-lg">Открыть полную карту ↗</a>';}
  const heroRoute=state.routes[0];
  const heroStops=(heroRoute?.places||[]).map(placeById).filter(Boolean);
  const heroStory=[...$("#top").querySelectorAll("div")].find(el=>el.classList.contains("lg:col-span-7")&&el.classList.contains("relative")&&el.querySelector("img"));
  if(heroStory&&heroRoute){const cover=heroStops.find(imageOf);heroStory.innerHTML=`<div class="absolute inset-0">${cover&&imageOf(cover)?`<img src="${esc(imageOf(cover))}" alt="${esc(heroRoute.title)}" class="w-full h-full object-cover">`:""}</div><div class="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/35 to-transparent"></div><div class="relative z-10 flex flex-col justify-between h-full min-h-[360px] p-space-lg"><div><span class="px-3 py-1.5 rounded-full bg-surface-bright/90 text-primary font-label-caps">Маршрут из каталога</span></div><div class="text-on-primary"><span class="font-label-caps uppercase tracking-widest text-secondary-container">Авторский сценарий</span><h3 class="font-headline-xl mt-2">${esc(heroRoute.title)}</h3><p class="font-body-md mt-2 text-surface-container-low/90">${esc(heroRoute.description||"")}</p><p class="font-body-sm mt-3">${heroStops.length} остановок · ${heroStops.map(p=>esc(p.title)).slice(0,3).join(" · ")}</p><a href="routes.html" class="inline-flex mt-4 px-4 py-2 rounded-full bg-surface-bright text-primary font-label-lg">Все маршруты →</a></div></div>`;}
  const featured=state.places.find(p=>cityOf(p)===activeCity&&imageOf(p))||state.places.find(imageOf);
  if(featured){
    const heroSection=$("main section");
    const featurePanel=[...heroSection.querySelectorAll("div")].find(el=>el.classList.contains("lg:col-span-5")&&el.classList.contains("bg-surface-container-lowest"));
    if(featurePanel)featurePanel.innerHTML=`<div class="relative h-56 overflow-hidden"><img src="${esc(imageOf(featured))}" alt="${esc(featured.title)}" class="w-full h-full object-cover"></div><div class="p-space-lg"><span class="font-label-caps text-label-caps uppercase text-secondary">Место из реального каталога</span><h3 class="font-headline-md text-primary mt-2">${esc(featured.title)}</h3><p class="font-body-md text-on-surface-variant mt-2">${esc(featured.description||"")}</p><p class="font-body-sm text-on-surface-variant mt-3">${esc(cityOf(featured))} · ${esc(featured.address||"Адрес уточняется")}</p><a class="inline-flex mt-4 text-secondary font-label-lg" href="place.html?id=${encodeURIComponent(featured.id)}">Открыть карточку →</a></div>`;
  }
  const mapFilters=$("#map-filter-group");
  if(mapFilters){const cats=[...new Set(state.places.filter(p=>cityOf(p)===activeCity).map(p=>p.category).filter(Boolean))].slice(0,6);mapFilters.innerHTML='<button class="px-4 py-2 rounded-full bg-primary-container text-on-primary font-label-lg" type="button" data-home-category="all">Все места</button>'+cats.map(c=>`<button class="px-4 py-2 rounded-full bg-surface-container-lowest text-on-surface font-label-lg" type="button" data-home-category="${esc(c)}">${esc(categoryOf({category:c}))}</button>`).join("");}
  const citySummary=[...$("#open-cities").querySelectorAll("span")].find(el=>/резиденц|локац/i.test(el.textContent));
  if(citySummary)citySummary.textContent=allCities().length+" городов · "+state.places.length+" мест";
}
function renderCatalog() {
  const grid=$("#places-grid"); if(!grid)return;
  const list=visiblePlaces();
  grid.innerHTML=list.length?list.map(stitchCard).join(""):'<div class="col-span-full text-center py-16 text-on-surface-variant">По вашему запросу ничего не найдено.</div>';
  grid.classList.toggle("grid-cols-1",viewMode==="list");
  grid.classList.toggle("md:grid-cols-2",viewMode!=="list");
  grid.classList.toggle("lg:grid-cols-3",viewMode!=="list");
  const citySelect=$("#city-select");
  if(citySelect){fillSelect(citySelect,allCities(),"Все города");citySelect.value=activeCity;}
  const cityPills=$("#city-pills");
  if(cityPills)cityPills.innerHTML=['all',...allCities()].map(c=>`<button class="px-3.5 py-1.5 rounded-full ${activeCity===c?"bg-primary-container text-on-primary":"bg-surface-container-lowest text-on-surface"} font-label-lg text-label-lg" data-city-filter="${esc(c)}">${c==="all"?"Все города":esc(c)}</button>`).join("");
  const cats=[...new Set(state.places.map(p=>p.category).filter(Boolean))].sort((a,b)=>categoryOf({category:a}).localeCompare(categoryOf({category:b}),"ru"));
  const categoryPills=$("#category-pills");
  if(categoryPills)categoryPills.innerHTML=['all',...cats].map(c=>`<button class="px-3.5 py-1.5 rounded-full ${activeCategory===c?"bg-primary-container text-on-primary":"bg-surface-container-lowest text-on-surface"} font-label-lg text-label-lg" data-category-filter="${esc(c)}">${c==="all"?"Все категории":esc(categoryOf({category:c}))}</button>`).join("");
  const total=$("[data-results-count]");if(total)total.textContent=list.length+" мест";
  const stat=[...document.querySelectorAll("main span,main strong")].find(el=>/248 локаций|\d+ локаций/.test(el.textContent));if(stat)stat.textContent=state.places.length+" мест";
  const verified=[...document.querySelectorAll("main span,main strong")].find(el=>/100% мест/.test(el.textContent));if(verified)verified.textContent="Адреса уточняются";
}
function initCatalog() {
  const search=$("#place-search");if(search)search.addEventListener("input",e=>{query=e.target.value;renderCatalog();});
  $("#city-select")?.addEventListener("change",e=>{activeCity=e.target.value;renderCatalog();});
  $("#city-pills")?.addEventListener("click",e=>{const b=e.target.closest("[data-city-filter]");if(!b)return;activeCity=b.dataset.cityFilter;renderCatalog();});
  $("#category-pills")?.addEventListener("click",e=>{const b=e.target.closest("[data-category-filter]");if(!b)return;activeCategory=b.dataset.categoryFilter;renderCatalog();});
  $("#view-grid")?.addEventListener("click",()=>{viewMode="grid";renderCatalog();});
  $("#view-list")?.addEventListener("click",()=>{viewMode="list";renderCatalog();});
  $("#view-map")?.addEventListener("click",()=>location.href="map.html");
  const mapPreview=$("#map-preview-container");if(mapPreview)mapPreview.innerHTML='<a href="map.html" class="block rounded-xl bg-primary-container text-on-primary p-6 font-headline-md">Открыть интерактивную карту всех мест →</a>';
  renderCatalog();
}
function initMapPage(home=false) {
  if(!window.L)return;
  if(!home){
    const container=$("#map-canvas-container");
    if(container)container.innerHTML='<div id="mapCanvas" class="absolute inset-0 w-full h-full min-h-[620px]"></div>';
  }
  const el=home?$("#homeMapCanvas"):$("#mapCanvas");
  if(!el)return;
  const instance=new MapView(el,id=>location.href="place.html?id="+encodeURIComponent(id));
  const filtered=()=>state.places.filter(p=>(activeCity==="all"||cityOf(p)===activeCity)&&Number.isFinite(+p.latitude)&&Number.isFinite(+p.longitude));
  instance.setPlaces(filtered(),true);
  if(home)homeMapView=instance;else mapView=instance;
  if(!home){
    const citySelect=$("#map-city-select");
    const renderList=()=>{
      const q=mapQuery.toLocaleLowerCase("ru");
      const list=filtered().filter(p=>!q||[p.title,p.address,cityOf(p)].join(" ").toLocaleLowerCase("ru").includes(q));
      const target=$("#places-container");
      const countLabel=[...document.querySelectorAll("#map-sidebar span")].find(el=>/Список мест/.test(el.textContent));
      if(countLabel)countLabel.textContent="Список мест ("+list.length+")";
      if(target)target.innerHTML=list.slice(0,100).map(p=>`<button class="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-surface-container-low text-left" data-map-place="${esc(p.id)}"><span class="w-2.5 h-2.5 rounded-full ${p.is_approx?"bg-secondary":"bg-primary"}"></span><span class="min-w-0"><strong class="block truncate text-primary text-sm">${esc(p.title)}</strong><small class="block truncate text-on-surface-variant">${esc(p.address||"Адрес уточняется")}</small></span></button>`).join("");
    };
    if(citySelect){fillSelect(citySelect,allCities(),"Все города");citySelect.value=activeCity;citySelect.addEventListener("change",()=>{activeCity=citySelect.value;instance.setPlaces(filtered(),true);renderList();});}
    renderList();
    $("#map-search-input")?.addEventListener("input",e=>{mapQuery=e.target.value;renderList();});
    $("#btn-geolocate")?.addEventListener("click",async()=>{try{const pos=await instance.locate();instance.map.setView([pos.latitude,pos.longitude],15);}catch{toast("Не удалось определить местоположение.");}});
    $("#btn-zoom-in")?.addEventListener("click",()=>instance.map.zoomIn());
    $("#btn-zoom-out")?.addEventListener("click",()=>instance.map.zoomOut());
    $("#btn-compass")?.addEventListener("click",()=>instance.fit(filtered()));
    $("#btn-layers")?.addEventListener("click",()=>toast("Используется карта OpenStreetMap."));
    $("#btn-route-toggle")?.addEventListener("click",()=>location.href="planner.html");
    $("#sidebar-toggle-btn")?.addEventListener("click",()=>$("#map-sidebar")?.classList.toggle("is-collapsed"));
    $("#tab-route")?.addEventListener("click",()=>location.href="planner.html");
    $("#tab-locations")?.addEventListener("click",renderList);
    $("#places-container")?.addEventListener("click",e=>{const b=e.target.closest("[data-map-place]");if(!b)return;const p=placeById(b.dataset.mapPlace);if(p){instance.focus(p);location.href="place.html?id="+encodeURIComponent(p.id);}});
  }
}
function renderFavorites() {
  const grid=$("#favorites-grid");if(!grid)return;
  const favs=state.places.filter(p=>state.favs.has(p.id)||state.favs.has(String(p.id)));
  if(favoritesGrouped)favs.sort((a,b)=>cityOf(a).localeCompare(cityOf(b),"ru")||a.title.localeCompare(b.title,"ru"));
  grid.innerHTML=favs.length?favs.map(stitchCard).join(""):'<div class="col-span-full text-center py-16 bg-surface-container-low rounded-xl"><span class="material-symbols-outlined text-4xl text-secondary">favorite_border</span><p class="font-headline-md text-primary mt-3">Коллекция пока пуста</p><p class="font-body-md text-on-surface-variant mt-2">Нажимайте на сердечко в карточках мест, чтобы сохранять интересное.</p><a href="catalog.html" class="inline-flex mt-5 px-5 py-2.5 rounded-full bg-primary-container text-on-primary">Открыть каталог</a></div>';
  const headings=$("main h1,main h2");const title=headings.find(h=>/персональн|коллекц/i.test(h.textContent));if(title)title.textContent="Ваша персональная коллекция";
  const savedText=$$("main h1,main h2,main p,main span").find(el=>/18 сохранённых мест/.test(el.textContent));if(savedText)savedText.textContent=favs.length+" сохранённых мест";
  const callout=$$("main a").find(a=>/В Конструктор|Собрать в Конструкторе прогулок/.test(a.textContent));if(callout)callout.href="planner.html";
  syncHeader();
}
function initFavoritesPage() {
  renderFavorites();
  const buttons=$("main button");
  buttons.find(b=>/Поделиться коллекцией/.test(b.textContent))?.addEventListener("click",async()=>{
    const list=state.places.filter(p=>state.favs.has(p.id)||state.favs.has(String(p.id)));
    const textValue="Мои места из «Прогулок с Катюшей»:\n"+list.map(p=>"• "+p.title+" — "+cityOf(p)).join("\n");
    try{await navigator.clipboard.writeText(textValue);toast("Список избранного скопирован.");}catch{toast("Не удалось скопировать список.");}
  });
  buttons.find(b=>/Экспорт в PDF/.test(b.textContent))?.addEventListener("click",()=>window.print());
  buttons.find(b=>/Автогруппировка по районам/.test(b.textContent))?.addEventListener("click",()=>{favoritesGrouped=!favoritesGrouped;renderFavorites();toast(favoritesGrouped?"Места сгруппированы по городам.":"Показан исходный порядок.");});
}
function readPlan() {
  try{const saved=JSON.parse(localStorage.getItem("rfn:plan")||"null");if(saved&&Array.isArray(saved.ids))plan={...plan,...saved};}catch{}
  const params=new URLSearchParams(location.search);
  if(params.has("plan"))plan.ids=params.get("plan").split(",").map(x=>placeById(x)?.id).filter(x=>x!=null);
}
function writePlan(){try{localStorage.setItem("rfn:plan",JSON.stringify(plan));}catch{}}
let plannerMapView=null;
function renderPlanPage() {
  const list=$("#stops-container");if(!list)return;
  const places=plan.ids.map(placeById).filter(Boolean);
  list.innerHTML=places.length?places.map((p,i)=>`<article class="stop-item flex items-start justify-between gap-3 p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30" data-stop-index="${i}"><div class="flex items-start gap-3"><span class="w-8 h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center">${i+1}</span><div><h3 class="font-headline-sm text-primary">${esc(p.title)}</h3><p class="text-sm text-on-surface-variant mt-1">${esc(p.address||cityOf(p))}</p>${p.is_approx?'<p class="text-xs text-secondary mt-1">Ориентировочная точка</p>':""}</div></div><div class="flex gap-1"><button data-stop-up="${i}" class="p-2" aria-label="Выше">↑</button><button data-stop-down="${i}" class="p-2" aria-label="Ниже">↓</button><button data-stop-remove="${i}" class="p-2 text-secondary" aria-label="Удалить">×</button></div></article>`).join(""):'<p class="text-on-surface-variant py-8 text-center">Пока нет остановок. Выберите готовый маршрут или добавьте места из каталога.</p>';
  $("#route-stops-count").textContent=String(places.length);
  let km=0;for(let i=1;i<places.length;i++)km+=haversineKm(places[i-1],places[i]);
  $("#route-dist").textContent=places.length>1?fmtDist(km):"—";
  const name=$("#config-city");if(name){fillSelect(name,allCities());if(!allCities().includes(name.value))name.value=activeCity;}
  const durationText=$$("main div,main p").find(el=>el.childElementCount===0&&/суммарно \(включая неспешный кофе/.test(el.textContent));
  if(durationText){const hours=(km/2.8)+(places.length*0.25);durationText.textContent="Около "+(Math.floor(hours))+" ч "+Math.round((hours%1)*60)+" мин · ориентировочная оценка";}
  const telemetry=$('main svg[viewBox="0 0 400 40"]')?.parentElement?.parentElement;
  if(telemetry)telemetry.innerHTML='<span class="font-label-caps text-label-caps uppercase text-on-surface-variant">Точность расчёта</span><p class="text-sm text-on-surface-variant mt-2">Расстояние рассчитано приблизительно по координатам. Фактический путь зависит от улиц, переходов и доступности входов.</p>';
  const points=places.filter(p=>Number.isFinite(+p.latitude)&&Number.isFinite(+p.longitude));
  if(plannerMapView){plannerMapView.setPlaces(points,true,true);const exact=points.filter(p=>!p.is_approx);if(exact.length>1)plannerMapView.drawRoute(exact,"walk");}
}
function initPlannerPage() {
  readPlan();
  const mapSvg=$('main svg[viewBox="0 0 600 460"]');
  const mapWrap=mapSvg?.parentElement;
  if(mapWrap){mapWrap.innerHTML='<div id="plannerMap" class="w-full h-[460px] rounded-xl overflow-hidden"></div>';if(window.L){plannerMapView=new MapView($("#plannerMap"),id=>location.href="place.html?id="+encodeURIComponent(id));}}
  renderPlanPage();
  $("#stops-container")?.addEventListener("click",e=>{
    const up=e.target.closest("[data-stop-up]"),down=e.target.closest("[data-stop-down]"),rm=e.target.closest("[data-stop-remove]");
    if(up){const i=+up.dataset.stopUp;if(i>0)[plan.ids[i-1],plan.ids[i]]=[plan.ids[i],plan.ids[i-1]];}
    if(down){const i=+down.dataset.stopDown;if(i<plan.ids.length-1)[plan.ids[i+1],plan.ids[i]]=[plan.ids[i],plan.ids[i+1]];}
    if(rm)plan.ids.splice(+rm.dataset.stopRemove,1);
    writePlan();renderPlanPage();
  });
  $("#btn-add-stop")?.addEventListener("click",()=>location.href="catalog.html");
  $("#btn-recalculate")?.addEventListener("click",()=>{
    if(!plan.ids.length){
      const city=$("#config-city")?.value||activeCity,mood=$("#config-mood")?.value||"coffee",duration=$("#config-duration")?.value||"medium";
      const count=duration==="short"?3:duration==="long"?6:4;
      const groups={
        romantic:["restaurant","cafe","coffee","viewpoint","sea","spa","park","garden"],
        architecture:["historic","monument","museum","attraction","city","viewpoint","square"],
        coffee:["coffee","cafe","bakery","restaurant"],
        rain:["museum","cafe","coffee","historic","gallery","mall"]
      };
      const preferred=new Set(groups[mood]||groups.coffee);
      const candidates=state.places.filter(p=>(city==="all"||cityOf(p)===city)&&preferred.has(p.category)).sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0));
      const fallback=state.places.filter(p=>city==="all"||cityOf(p)===city).sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0));
      plan.ids=(candidates.length?candidates:fallback).slice(0,count).map(p=>p.id);
      plan.name=(($("#config-mood option:checked")?.textContent||"Прогулка").trim())+" · "+city;
      writePlan();renderPlanPage();toast("Собрали сценарий из мест вашего каталога.");return;
    }
    const items=plan.ids.map(placeById).filter(Boolean);
    const exact=items.filter(p=>!p.is_approx&&Number.isFinite(+p.latitude)&&Number.isFinite(+p.longitude));
    if(exact.length>2){
      const ordered=[exact.shift()];
      while(exact.length){let best=0,dist=Infinity;exact.forEach((p,i)=>{const d=haversineKm(ordered[ordered.length-1],p);if(d<dist){dist=d;best=i;}});ordered.push(exact.splice(best,1)[0]);}
      const ids=new Set(ordered.map(p=>String(p.id)));
      plan.ids=[...ordered.map(p=>p.id),...items.filter(p=>!ids.has(String(p.id))).map(p=>p.id)];
      writePlan();renderPlanPage();toast("Порядок остановок оптимизирован.");
    } else toast("Добавьте больше точных точек для оптимизации маршрута.");
  });
  $("#btn-save-fav")?.addEventListener("click",()=>{
    const saved=JSON.parse(localStorage.getItem("katyusha:saved-routes")||"[]");
    saved.push({id:Date.now(),name:plan.name||"Моя прогулка",ids:[...plan.ids],mode:plan.mode});
    localStorage.setItem("katyusha:saved-routes",JSON.stringify(saved));toast("Маршрут сохранён на устройстве.");
  });
  $("#btn-share")?.addEventListener("click",async()=>{
    const url=new URL("planner.html",location.href);url.searchParams.set("plan",plan.ids.join(","));
    try{await navigator.clipboard.writeText(url.toString());toast("Ссылка на маршрут скопирована.");}catch{toast(url.toString());}
  });
  $("#btn-export-guide")?.addEventListener("click",()=>window.print());
  const actions=$("#btn-export-guide")?.parentElement;
  if(actions&&!$("#btn-open-navigation")){const nav=document.createElement("button");nav.id="btn-open-navigation";nav.type="button";nav.className="px-4 py-2 rounded-full bg-primary-container text-on-primary font-label-lg";nav.textContent="Открыть в Google Maps";actions.append(nav);nav.addEventListener("click",()=>{const pts=plan.ids.map(placeById).filter(p=>p&&!p.is_approx&&Number.isFinite(+p.latitude)&&Number.isFinite(+p.longitude));if(pts.length<2)return toast("Для точной навигации нужны минимум две точные точки.");window.open(googleUrl(pts[pts.length-1],pts[0],pts.slice(1,-1),"walk"),"_blank");});}
  const city=$("#config-city");if(city){fillSelect(city,allCities());city.value=allCities().includes(activeCity)?activeCity:allCities()[0];city.addEventListener("change",()=>{activeCity=city.value;renderSuggestedRoutes();});}
  $("#btn-recalculate")?.setAttribute("type","button");
  renderSuggestedRoutes();
}
function renderSuggestedRoutes() {
  const grid=$("#suggested-routes-grid");if(!grid)return;
  const city=$("#config-city")?.value;
  const filtered=state.routes.filter(r=>(r.places||[]).some(id=>{const p=placeById(id);return p&&(!city||city==="all"||cityOf(p)===city);}));
  grid.innerHTML=(filtered.length?filtered:state.routes).map(routeCard).join("");
}
function renderRoutesPage() {
  const grid=$("#routes-grid");if(grid)grid.innerHTML=state.routes.map(routeCard).join("");
  const r=state.routes[0],stops=(r?.places||[]).map(placeById).filter(Boolean);
  const featureTitle=$$("main h2").find(h=>/Скрытый Петербург|Редакторские маршруты/i.test(h.textContent));
  if(featureTitle&&r)featureTitle.textContent=r.title;
  const featureImage=$("main img");if(featureImage&&stops.find(imageOf)){featureImage.src=imageOf(stops.find(imageOf));featureImage.alt=r.title;}
  const featureText=$$("main p").find(p=>p.textContent.includes("Здесь пахнет старой типографской"));
  if(featureText&&r)featureText.textContent=r.description||"Авторский маршрут из реальных мест каталога.";
}
function renderPlacePage() {
  const id=new URLSearchParams(location.search).get("id");
  const p=placeById(id)||state.places[0];if(!p)return;
  const main=$("main");if(!main)return;
  const img=imageOf(p);
  main.innerHTML=`<div class="max-w-[1200px] mx-auto px-gutter py-space-xl"><a href="catalog.html" class="inline-flex items-center gap-2 text-secondary font-label-lg mb-6">← Назад к каталогу</a><div class="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start"><div class="lg:col-span-7"><div class="rounded-2xl overflow-hidden bg-surface-container-high">${img?`<img src="${esc(img)}" alt="${esc(p.title)}" class="w-full max-h-[620px] object-cover">`:'<div class="h-80 flex items-center justify-center"><span class="material-symbols-outlined text-6xl">place</span></div>'}</div><div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">${(Array.isArray(p.photos)?p.photos:[]).slice(0,6).map(ph=>`<img src="${esc(ph.url||ph)}" alt="${esc(p.title)}" class="w-full h-28 object-cover rounded-lg" loading="lazy">`).join("")}</div></div><div class="lg:col-span-5 bg-surface-container-lowest rounded-2xl p-space-lg"><span class="text-xs uppercase tracking-widest text-secondary">${esc(categoryOf(p))} · ${esc(cityOf(p))}</span><h1 class="font-headline-xl text-primary mt-3">${esc(p.title)}</h1><p class="font-body-md text-on-surface-variant mt-4">${esc(p.description||"Описание уточняется.")}</p><div class="border-t border-surface-container mt-6 pt-5 space-y-3 text-sm"><p><strong>Адрес:</strong> ${esc(p.address||"Уточняется")}</p><p><strong>Стоимость:</strong> ${esc(priceOf(p))}</p><p><strong>Время работы:</strong> ${esc(p.opening_hours||"Нет подтверждённых данных")}</p>${p.phone?`<p><strong>Телефон:</strong> <a class="text-secondary" href="tel:${esc(p.phone)}">${esc(p.phone)}</a></p>`:""}${p.is_approx?'<p class="text-secondary">Координаты ориентировочные — проверьте точный вход перед поездкой.</p>':""}</div><div class="flex flex-wrap gap-2 mt-6"><button class="px-4 py-2 rounded-full bg-primary-container text-on-primary" data-add-plan="${esc(p.id)}">Добавить в прогулку</button><button class="px-4 py-2 rounded-full bg-surface-container-low" data-favorite="${esc(p.id)}">♡ Избранное</button><button class="px-4 py-2 rounded-full bg-surface-container-low" data-visit="${esc(p.id)}">Были здесь</button><a class="px-4 py-2 rounded-full bg-surface-container-low" target="_blank" rel="noopener" href="${esc(p.map_url||googleUrl(p))}">Открыть карту ↗</a>${p.website?`<a class="px-4 py-2 rounded-full bg-surface-container-low" target="_blank" rel="noopener" href="${esc(p.website)}">Сайт ↗</a>`:""}</div></div></div></div>`;
  document.title=p.title+" — Прогулки с Катюшей";
}
function bindCommon() {
  document.addEventListener("click",async e=>{
    const fav=e.target.closest("[data-favorite]");
    if(fav){const p=placeById(fav.dataset.favorite);if(p){const on=!(state.favs.has(p.id)||state.favs.has(String(p.id)));await setFavorite(p.id,on,state.favs);syncHeader();if(page==="favorites")renderFavorites();else if(page==="catalog")renderCatalog();else if(page==="home")renderHome();}return;}
    const add=e.target.closest("[data-add-plan]");
    if(add){const p=placeById(add.dataset.addPlan);if(p){if(!plan.ids.some(x=>String(x)===String(p.id))){plan.ids.push(p.id);writePlan();toast("Добавлено в прогулку.");}else toast("Это место уже в маршруте.");}return;}
    const open=e.target.closest("[data-open-place]");
    if(open){location.href="place.html?id="+encodeURIComponent(open.dataset.openPlace);return;}
    const visit=e.target.closest("[data-visit]");
    if(visit){const p=placeById(visit.dataset.visit);if(p)visitDialog(p);return;}
    const load=e.target.closest("[data-load-route]");
    if(load){const r=state.routes.find(x=>String(x.id)===String(load.dataset.loadRoute));if(r){plan.ids=(r.places||[]).map(id=>placeById(id)?.id).filter(id=>id!=null);plan.name=r.title;writePlan();location.href="planner.html";}return;}
    const city=e.target.closest("[data-city-pick]");
    if(city){activeCity=city.dataset.cityPick;location.href="catalog.html?city="+encodeURIComponent(activeCity);return;}
  });
}
async function init() {
  window.addEventListener("katyusha:toast",e=>toast(e.detail||"Готово"));
  const loaded=await loadData();
  state.places=loaded.places?.length?loaded.places:PLACES;
  state.routes=loaded.routes?.length?loaded.routes:ROUTES;
  state.favs=loaded.favs||new Set();
  hydrateVisits().catch(()=>{});
  readPlan();
  const cities=allCities();if(!cities.includes(activeCity))activeCity=cities.includes("Баку")?"Баку":cities[0]||"all";
  const params=new URLSearchParams(location.search);if(params.has("city"))activeCity=params.get("city");
  bindCommon();
  const headerSearch=[...document.querySelectorAll("header button")].find(b=>/Найти место|Найти место, улицу/i.test(b.textContent));
  headerSearch?.addEventListener("click",()=>location.href="catalog.html");
  if(page==="home"){
    renderHome();initMapPage(true);
    $("#hero-city-select")?.addEventListener("change",e=>{activeCity=e.target.value;syncHeader();renderHome();homeMapView?.setPlaces(state.places.filter(p=>Number.isFinite(+p.latitude)&&Number.isFinite(+p.longitude)&&cityOf(p)===activeCity),true);});
    $("#map-filter-group")?.addEventListener("click",e=>{const b=e.target.closest("[data-home-category]");if(!b)return;const category=b.dataset.homeCategory;const points=state.places.filter(p=>cityOf(p)===activeCity&&(category==="all"||p.category===category)&&Number.isFinite(+p.latitude)&&Number.isFinite(+p.longitude));homeMapView?.setPlaces(points,true);});
  }
  if(page==="catalog")initCatalog();
  if(page==="map")initMapPage(false);
  if(page==="favorites")initFavoritesPage();
  if(page==="planner")initPlannerPage();
  if(page==="routes")renderRoutesPage();
  if(page==="place")renderPlacePage();
  if(page==="about"){
    const curatorHeading=$$("main h1,main h2,main h3").find(h=>/редакция и кураторы/i.test(h.textContent));
    curatorHeading?.closest("section")?.remove();
    const form=$("#suggest-place-form");
    form?.addEventListener("submit",e=>{e.preventDefault();const data=Object.fromEntries(new FormData(form));const items=JSON.parse(localStorage.getItem("katyusha:place-suggestions")||"[]");items.push({...data,created_at:new Date().toISOString()});localStorage.setItem("katyusha:place-suggestions",JSON.stringify(items));toast("Предложение сохранено на этом устройстве. Спасибо!");form.reset();});
  }
  syncHeader();
  document.body.classList.add("stitch-ready");
}
init().catch(error=>{console.error("Stitch app:",error);document.body.classList.add("stitch-ready");toast("Не удалось загрузить каталог. Попробуйте обновить страницу.");});
