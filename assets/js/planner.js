// «Спланируй прогулку»: ручной конструктор маршрута (добавление, порядок, режим, участки, сохранение, ссылка).
import { state, byId } from "./state.js?v=20261124r";
import { $, $$, icon, esc, cat, toast, fmtMin } from "./ui.js?v=20261124n";
import { MapView, route, estimateLeg, haversineKm, googleUrl, osmUrl, fmtDist, fmtDur } from "./map.js?v=20261124n";
import { visitMinutes, currencyFor } from "./taxonomy.js?v=20261124n";

const LS_PLAN = "rfn:plan", LS_SAVED = "rfn:saved-routes";
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } };

let planMap = null, legs = [], legsExact = false, token = 0, dragFrom = null;
const stops = () => state.plan.ids.map(byId).filter(Boolean);

/* ---------- Операции над маршрутом ---------- */
export function setPlan(ids, mode = state.plan.mode, name = "") {
  const normalizedIds = [...new Set(ids.map(Number).filter(Number.isFinite))].filter((id) => byId(id));
  state.plan = { ids: normalizedIds, mode: mode === "drive" ? "drive" : "walk", name };
  commit();
}
export function addToPlan(id) {
  const normalizedId = Number(id);
  if (!Number.isFinite(normalizedId)) return toast("Не удалось определить место");
  if (state.plan.ids.some((existing) => String(existing) === String(normalizedId))) return toast("Это место уже в маршруте");
  state.plan.ids.push(normalizedId);
  commit();
  toast(`Добавлено в маршрут: ${byId(normalizedId)?.title}`);
}
const removeAt = (i) => { state.plan.ids.splice(i, 1); commit(); };
const move = (from, to) => {
  if (to < 0 || to >= state.plan.ids.length || from === to) return;
  const [x] = state.plan.ids.splice(from, 1);
  state.plan.ids.splice(to, 0, x);
  commit();
};
/** Порядок по ближайшему соседу: первая точка остаётся, дальше всегда идём к ближайшей из оставшихся. */
function optimize() {
  const pts = stops();
  if (pts.length < 3) return toast("Для оптимизации нужно минимум три места");
  const left = pts.slice(1), order = [pts[0]];
  while (left.length) {
    const last = order.at(-1);
    left.sort((a, b) => haversineKm(last, a) - haversineKm(last, b));
    order.push(left.shift());
  }
  const before = pathKm(pts), after = pathKm(order);
  state.plan.ids = order.map((p) => p.id);
  commit();
  toast(after < before - 0.05 ? `Порядок улучшен: путь короче на ${fmtDist(before - after)}` : "Текущий порядок уже удобен");
}
const pathKm = (pts) => pts.slice(1).reduce((s, p, i) => s + haversineKm(pts[i], p), 0);

function commit() {
  write(LS_PLAN, state.plan);
  renderPlanner();
  refreshLegs();
}

/* ---------- Участки: расстояние и время ---------- */
async function refreshLegs() {
  const pts = stops(), my = ++token;
  legs = []; legsExact = false;
  paintLegs(pts);
  if (pts.length < 2) return drawMap(pts, null);
  let info = null;
  try { info = await route(pts, state.plan.mode); } catch { /* используем оценку */ }
  if (my !== token) return;
  if (info?.legs?.length === pts.length - 1) { legs = info.legs; legsExact = true; }
  else legs = pts.slice(1).map((p, i) => estimateLeg(pts[i], p, state.plan.mode));
  paintLegs(pts);
  drawMap(pts, info);
}
function paintLegs(pts) {
  $$("[data-leg]").forEach((el) => {
    const l = legs[+el.dataset.leg];
    el.innerHTML = l ? `${icon(state.plan.mode === "walk" ? "walk" : "car")}${legsExact ? "" : "≈ "}${fmtDist(l.km)} · ${fmtDur(l.min)}` : `${icon("route")}считаем…`;
    el.classList.toggle("is-far", !!l && state.plan.mode === "walk" && l.km > 4);
  });
  const t = $("#planTotals");
  if (!t) return;
  if (!pts.length) { t.innerHTML = ""; return; }
  const km = legs.reduce((s, l) => s + l.km, 0), min = legs.reduce((s, l) => s + l.min, 0);
  const visit = pts.reduce((s, p) => s + visitMinutes(p), 0);
  const cur = currencyFor(pts[0]);
  const priced = pts.filter((p) => p.price_min != null && currencyFor(p) === cur);
  const cost = priced.reduce((s, p) => s + Number(p.price_min), 0);
  const cities = new Set(pts.map((p) => p.city).filter(Boolean));
  const far = legs.some((l) => state.plan.mode === "walk" && l.km > 4);
  t.innerHTML = `<div class="totals">
      <div><strong>${pts.length}</strong><span>${pts.length === 1 ? "остановка" : "остановок"}</span></div>
      <div><strong>${legs.length ? fmtDist(km) : "…"}</strong><span>${legsExact ? "по дорогам" : legs.length ? "оценка" : ""}</span></div>
      <div><strong>${legs.length ? fmtDur(min) : "…"}</strong><span>в пути</span></div>
      <div><strong>${fmtMin(visit)}</strong><span>на посещение</span></div>
      ${priced.length ? `<div><strong>≈ ${cost.toLocaleString("ru-RU")} ${cur}</strong><span>билеты и чеки, на чел.${priced.length < pts.length ? `, по ${priced.length} из ${pts.length}` : ""}</span></div>` : ""}
    </div>
    ${cities.size > 1 ? `<p class="note">Места находятся в разных городах: проверьте, что маршрут действительно один.</p>` : ""}
    ${far ? `<p class="note">Некоторые участки длиннее 4 км. Для них удобнее переключиться на автомобиль.</p>` : ""}`;
}

/* ---------- Карта планировщика ---------- */
function drawMap(pts, info) {
  if (!planMap) {
    if (!pts.length || !$("#planMapCanvas") || typeof L === "undefined") return;
    planMap = new MapView($("#planMapCanvas"));
  }
  planMap.refresh();
  planMap.setPlaces(pts, false, true);
  planMap.clearRoute();
  if (!pts.length) return;
  const line = info?.line || pts.map((p) => [p.latitude, p.longitude]);
  L.polyline(line, { color: "#D8365C", weight: 5, opacity: 0.9, dashArray: info ? null : "8 8", lineCap: "round" }).addTo(planMap.routeLayer);
  planMap.map.fitBounds(L.latLngBounds(line), { padding: [50, 50], maxZoom: 15 });
}

/* ---------- Отрисовка ---------- */
export function renderPlanner() {
  const pts = stops(), list = $("#planStops");
  if (!list) return;
  $$("#planModes button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.planMode === state.plan.mode));
  $("#planName").value = state.plan.name || "";
  list.innerHTML = pts.length ? pts.map((p, i) => {
    const c = cat(p);
    return `<li class="stop" draggable="true" data-stop="${i}">
      <span class="stop__n" style="--h:${c.hue}">${i + 1}</span>
      <div class="stop__t"><strong>${esc(p.title)}</strong><small>${esc(c.title)} · ≈ ${fmtMin(visitMinutes(p))}${p.city ? ` · ${esc(p.city)}` : ""}</small></div>
      <span class="stop__ctl">
        <button class="icon-btn" data-plan-up="${i}" aria-label="Выше" ${i === 0 ? "disabled" : ""}>${icon("up")}</button>
        <button class="icon-btn" data-plan-down="${i}" aria-label="Ниже" ${i === pts.length - 1 ? "disabled" : ""}>${icon("down")}</button>
        <button class="icon-btn" data-plan-del="${i}" aria-label="Убрать из маршрута">${icon("trash")}</button>
      </span>
      ${i < pts.length - 1 ? `<span class="stop__leg" data-leg="${i}"></span>` : ""}
    </li>`;
  }).join("") : `<li class="empty">Маршрут пуст. Найдите место выше или нажмите «В маршрут» на любой карточке.</li>`;
  const has = pts.length > 0, ok2 = pts.length > 1;
  $("#planActions").innerHTML = `
    <button class="btn btn--sm" data-plan-act="optimize" ${pts.length < 3 ? "disabled" : ""}>${icon("refresh")}Оптимизировать порядок</button>
    ${ok2 ? `<a class="btn btn--sm" target="_blank" rel="noopener" href="${googleUrl(pts.at(-1), pts[0], pts.slice(1, -1).slice(0, 8), state.plan.mode)}">${icon("nav")}Google Maps</a>
    <a class="btn btn--sm" target="_blank" rel="noopener" href="${osmUrl(pts, state.plan.mode)}">OpenStreetMap</a>` : ""}
    <button class="btn btn--sm btn--primary" data-plan-act="save" ${has ? "" : "disabled"}>${icon("bookmark")}Сохранить</button>
    <button class="btn btn--sm" data-plan-act="share" ${has ? "" : "disabled"}>${icon("share")}Поделиться</button>
    <button class="btn btn--sm" data-plan-act="clear" ${has ? "" : "disabled"}>Очистить</button>`;
  $("#planMapWrap").hidden = !has;
  paintLegs(pts);
  renderSaved();
}

function renderSaved() {
  const html = state.saved.length ? state.saved.map((r) => {
    const n = r.ids.filter((id) => byId(id)).length;
    return `<article class="card saved"><div class="saved__t"><h3>${esc(r.name || "Без названия")}</h3>
      <p class="muted">${n} ${n === 1 ? "место" : "мест"} · ${r.mode === "walk" ? "пешком" : "на авто"}</p></div>
      <div class="saved__ctl">
        <button class="btn btn--sm" data-plan-open="${r.id}">Открыть</button>
        <button class="icon-btn ${r.fav ? "is-fav" : ""}" data-plan-fav="${r.id}" aria-pressed="${!!r.fav}" aria-label="${r.fav ? "Убрать из избранного" : "В избранное"}">${icon("heart")}</button>
        <button class="icon-btn" data-plan-share="${r.id}" aria-label="Поделиться">${icon("share")}</button>
        <button class="icon-btn" data-plan-rm="${r.id}" aria-label="Удалить маршрут">${icon("trash")}</button>
      </div></article>`;
  }).join("") : `<p class="muted">Сохранённых маршрутов пока нет.</p>`;
  const el = $("#savedPlans"); if (el) el.innerHTML = html;
  const favs = state.saved.filter((r) => r.fav);
  const fr = $("#favRoutes");
  if (fr) fr.innerHTML = favs.length ? `<h3 class="sub">Избранные маршруты</h3><div class="grid grid--fav">${favs.map((r) => `<article class="card saved"><div class="saved__t"><h3>${esc(r.name || "Без названия")}</h3><p class="muted">${r.ids.length} мест · ${r.mode === "walk" ? "пешком" : "на авто"}</p></div><div class="saved__ctl"><button class="btn btn--sm" data-plan-open="${r.id}">Открыть</button><button class="icon-btn is-fav" data-plan-fav="${r.id}" aria-label="Убрать из избранного">${icon("heart")}</button></div></article>`).join("")}</div>` : "";
}

/* ---------- Сохранение и ссылки ---------- */
function savePlan() {
  const ids = state.plan.ids;
  if (!ids.length) return;
  const name = ($("#planName").value || "").trim() || `Маршрут: ${byId(ids[0])?.title}`;
  state.plan.name = name;
  const existing = state.saved.find((r) => r.name === name);
  if (existing) Object.assign(existing, { ids: [...ids], mode: state.plan.mode });
  else state.saved.unshift({ id: Date.now(), name, ids: [...ids], mode: state.plan.mode, fav: false });
  write(LS_SAVED, state.saved); write(LS_PLAN, state.plan);
  renderSaved();
  toast(existing ? "Маршрут обновлён" : "Маршрут сохранён на этом устройстве");
}
export const planUrl = (ids, mode, name) => {
  const u = new URL(location.href);
  u.search = ""; u.hash = "planner";
  u.searchParams.set("plan", ids.join(","));
  u.searchParams.set("mode", mode);
  if (name) u.searchParams.set("name", name);
  return u.toString();
};
export async function sharePlan(ids = state.plan.ids, mode = state.plan.mode, name = state.plan.name) {
  const url = planUrl(ids, mode, name);
  try {
    if (navigator.share) { await navigator.share({ title: name || "Маршрут прогулки", url }); return; }
    await navigator.clipboard.writeText(url);
    toast("Ссылка на маршрут скопирована");
  } catch (e) {
    if (e?.name !== "AbortError") window.prompt("Скопируйте ссылку на маршрут:", url);
  }
}
function loadFromUrl() {
  const q = new URLSearchParams(location.search);
  const ids = (q.get("plan") || "").split(",").map(Number).filter(Number.isFinite);
  if (!ids.length) return false;
  setPlan(ids, q.get("mode") || "walk", q.get("name") || "");
  toast("Открыт маршрут по ссылке");
  setTimeout(() => $("#planner")?.scrollIntoView({ behavior: "smooth" }), 400);
  return true;
}

/** Сохраняет готовую программу (например, из «Идеального дня») как маршрут. */
export function savePlanAs(ids, mode, name) { setPlan(ids, mode, name); savePlan(); }

/* ---------- Поиск мест для добавления ---------- */
function renderResults() {
  const q = $("#planSearch").value.trim().toLocaleLowerCase("ru"), box = $("#planResults");
  if (!q) { box.hidden = true; return; }
  const found = state.places.filter((p) => !state.plan.ids.some((id) => String(id) === String(p.id)) &&
    [p.title, p.city, p.address, cat(p).title].filter(Boolean).join(" ").toLocaleLowerCase("ru").includes(q)).slice(0, 8);
  box.hidden = false;
  box.innerHTML = found.length ? found.map((p) => `<li><button data-plan-add="${p.id}" data-keep="1"><strong>${esc(p.title)}</strong><small>${esc(cat(p).title)}${p.city ? ` · ${esc(p.city)}` : ""}</small>${icon("plus")}</button></li>`).join("") : `<li class="empty">Ничего не найдено</li>`;
}

/* ---------- События ---------- */
export function initPlanner() {
  state.saved = read(LS_SAVED, []);
  const draft = read(LS_PLAN, null);
  if (draft?.ids) state.plan = { ids: draft.ids.filter((id) => byId(id)), mode: draft.mode === "drive" ? "drive" : "walk", name: draft.name || "" };
  if (!loadFromUrl()) { renderPlanner(); refreshLegs(); }

  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-plan-add]");
    if (add) { addToPlan(+add.dataset.planAdd); if (add.dataset.keep) { $("#planSearch").value = ""; $("#planResults").hidden = true; } return; }
    const t = e.target.closest("[data-plan-up],[data-plan-down],[data-plan-del],[data-plan-mode],[data-plan-act],[data-plan-open],[data-plan-fav],[data-plan-share],[data-plan-rm]");
    if (!t) { if (!e.target.closest(".plan__add")) $("#planResults").hidden = true; return; }
    const d = t.dataset;
    if (d.planUp != null) return move(+d.planUp, +d.planUp - 1);
    if (d.planDown != null) return move(+d.planDown, +d.planDown + 1);
    if (d.planDel != null) return removeAt(+d.planDel);
    if (d.planMode) { state.plan.mode = d.planMode; return commit(); }
    if (d.planAct === "optimize") return optimize();
    if (d.planAct === "save") return savePlan();
    if (d.planAct === "share") return sharePlan();
    if (d.planAct === "clear") { state.plan = { ids: [], mode: state.plan.mode, name: "" }; return commit(); }
    const r = state.saved.find((x) => x.id === +(d.planOpen ?? d.planFav ?? d.planShare ?? d.planRm));
    if (!r) return;
    if (d.planOpen) { setPlan(r.ids, r.mode, r.name); $("#planner").scrollIntoView({ behavior: "smooth" }); }
    if (d.planFav) { r.fav = !r.fav; write(LS_SAVED, state.saved); renderSaved(); toast(r.fav ? "Маршрут добавлен в избранное" : "Маршрут убран из избранного"); }
    if (d.planShare) sharePlan(r.ids, r.mode, r.name);
    if (d.planRm) { state.saved = state.saved.filter((x) => x !== r); write(LS_SAVED, state.saved); renderSaved(); toast("Маршрут удалён"); }
  });
  $("#planSearch").addEventListener("input", renderResults);
  $("#planSearch").addEventListener("focus", renderResults);
  $("#planName").addEventListener("input", (e) => { state.plan.name = e.target.value; write(LS_PLAN, state.plan); });

  // Перетаскивание (на телефоне работают кнопки «выше/ниже»)
  const list = $("#planStops");
  list.addEventListener("dragstart", (e) => { const li = e.target.closest("[data-stop]"); if (li) { dragFrom = +li.dataset.stop; e.dataTransfer.effectAllowed = "move"; li.classList.add("is-drag"); } });
  list.addEventListener("dragover", (e) => { if (dragFrom != null) e.preventDefault(); });
  list.addEventListener("drop", (e) => { const li = e.target.closest("[data-stop]"); if (li && dragFrom != null) { e.preventDefault(); move(dragFrom, +li.dataset.stop); } dragFrom = null; });
  list.addEventListener("dragend", () => { dragFrom = null; $$(".is-drag", list).forEach((x) => x.classList.remove("is-drag")); });

  // Карта планировщика подгружается, когда секция приближается к экрану
  const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { io.disconnect(); refreshLegs(); } }, { rootMargin: "400px" });
  io.observe($("#planner"));
}
