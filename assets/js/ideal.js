// «Мой идеальный день»: подбор программы по настроению, городу, бюджету, времени и интересам.
// Алгоритм детерминирован при одном seed и не использует внешние сервисы: работает офлайн на данных каталога.
import { state } from "./state.js?v=20261124r";
import { $, $$, icon, esc, cat, cover, toast, fmtMin } from "./ui.js?v=20261124n";
import { MOODS, ROLES, ATMOSPHERES, VENUE_GROUPS, kindOf, groupOf, visitMinutes, currencyFor } from "./taxonomy.js?v=20261124countrycurrency";
import { estimateLeg, haversineKm, fmtDist } from "./map.js?v=20261124n";
import { setPlan, sharePlan, savePlanAs } from "./planner.js?v=20261124w";

const EXTRA_ROLES = ["walk", "drinks", "night", "cafe"]; // если время ещё осталось, а сценарий закончился
const SIGHT_ROLES = new Set(["walk", "photo", "culture"]);
let current = null; // { opts, stops, seed }
let favBtnFn = () => "";

/** Небольшой детерминированный генератор случайных чисел (mulberry32). */
const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const brand = (p) => String(p.title).split(/\s+[—-]\s+/)[0].toLocaleLowerCase("ru"); // сеть: «Хачапури и Вино — …»

/** Оценка пригодности места для роли. Чем выше, тем лучше. */
function score(p, role, prev, o, rand) {
  const r = ROLES[role], c = p.category;
  let s = 0;
  // Место без рейтинга получает нейтральную оценку (как рейтинг ≈ 4.0), чтобы новые достопримечательности не проигрывали заранее
  s += p.rating != null ? (Number(p.rating) - 3) * 0.8 : 0.8;
  if (p.review_count) s += Math.min(Math.log10(1 + Number(p.review_count)) / 3, 1) * 0.6;
  s += (1 - r.cats.indexOf(c) / r.cats.length) * 0.8;                 // насколько категория типична для роли
  if (SIGHT_ROLES.has(role) && kindOf(p) === "sight") s += 0.7;      // достопримечательности важнее
  if (ATMOSPHERES[o.atmosphere]?.cats.includes(c)) s += 0.8;
  if (o.interests.size && (o.interests.has(groupOf(p)?.key) || (o.interests.has("sights") && kindOf(p) === "sight"))) s += 1.5;
  if (prev) {
    const km = haversineKm(prev, p);
    s -= Math.min(km, 25) * (o.transport === "walk" ? 0.5 : 0.18);   // чем ближе к предыдущей точке, тем лучше
    if (prev.category === c) s -= 0.8;                                // не ставим однотипные места подряд
  }
  if (p.is_approx) s -= 0.2;
  return s + rand() * 0.5;
}

/** Выбирает лучшее место для роли среди неиспользованных. */
function pick(role, used, brands, prev, o, rand, spent, exclude = new Set()) {
  const cur = currencyFor(o.pool[0]);
  const cand = o.pool.filter((p) =>
    ROLES[role].cats.includes(p.category) && !used.has(String(p.id)) && !exclude.has(String(p.id)) && !brands.has(brand(p)) &&
    !(o.budget != null && p.price_min != null && currencyFor(p) === cur && spent + Number(p.price_min) > o.budget));
  if (!cand.length) return null;
  return cand.map((p) => [p, score(p, role, prev, o, rand)]).sort((a, b) => b[1] - a[1])[0][0];
}

/** Считает время: старт, дорога от предыдущей точки, визит, конец. */
function retime(stops, o) {
  let t = MOODS[o.mood].start * 60;
  stops.forEach((s, i) => {
    s.travel = i ? estimateLeg(stops[i - 1].place, s.place, o.transport) : null;
    t += s.travel ? s.travel.min : 0;
    s.start = t; s.visit = visitMinutes(s.place); t += s.visit; s.end = t;
  });
  return stops;
}

export function generate(o, seed) {
  const rand = rng(seed), mood = MOODS[o.mood], limit = o.hours * 60;
  o.pool = state.places.filter((p) => p.city === o.city && Number.isFinite(+p.latitude) && Number.isFinite(+p.longitude));
  const stops = [], used = new Set(), brands = new Set(), missing = new Set();
  let spent = 0, clock = mood.start * 60;
  const roles = [...mood.roles, ...EXTRA_ROLES, ...EXTRA_ROLES];
  for (const role of roles) {
    const prev = stops.at(-1)?.place || null;
    const p = pick(role, used, brands, prev, o, rand, spent);
    if (!p) { if (mood.roles.includes(role)) missing.add(role); continue; }
    const travel = prev ? estimateLeg(prev, p, o.transport).min : 0;
    if (stops.length && clock + travel + visitMinutes(p) - mood.start * 60 > limit + 20) continue; // не влезает по времени
    stops.push({ place: p, role });
    used.add(String(p.id)); brands.add(brand(p));
    clock += travel + visitMinutes(p);
    if (p.price_min != null && currencyFor(p) === currencyFor(o.pool[0])) spent += Number(p.price_min);
  }
  retime(stops, o);
  const found = new Set(stops.map((x) => x.role));
  return { opts: o, stops, seed, missing: [...missing].filter((r) => !found.has(r)) };
}

/** Замена одной остановки на следующий лучший вариант той же роли. */
function swap(index) {
  const { opts: o, stops } = current;
  const s = stops[index], used = new Set(stops.map((x) => x.place.id)), brands = new Set(stops.filter((_, i) => i !== index).map((x) => brand(x.place)));
  const rand = rng(Date.now() & 0xffff);
  const p = pick(s.role, used, brands, stops[index - 1]?.place || null, o, rand, 0, new Set([s.place.id]));
  if (!p) return toast("Для этой остановки нет других подходящих мест");
  s.place = p; retime(stops, o); render();
}

/* ---------- Форма ---------- */
function readForm() {
  const f = $("#idealForm"), data = new FormData(f);
  const budget = data.get("budget") === "" ? null : Number(data.get("budget"));
  return {
    mood: data.get("mood") || "romantic", city: data.get("city"), budget: Number.isFinite(budget) ? budget : null,
    hours: Number(data.get("hours")), people: Math.max(1, Number(data.get("people")) || 1),
    transport: data.get("transport"), atmosphere: data.get("atmosphere"),
    interests: new Set($$('#idealInterests input:checked').map((i) => i.value)),
  };
}

export function renderIdealForm() {
  const cities = [...new Set(state.places.map((p) => p.city).filter(Boolean))]
    .map((c) => [c, state.places.filter((p) => p.city === c).length]).sort((a, b) => b[1] - a[1]);
  const sel = $("#idealCity");
  sel.innerHTML = cities.map(([c, n]) => `<option value="${esc(c)}">${esc(c)} (${n})</option>`).join("");
  sel.value = cities.some(([c]) => c === state.city) ? state.city : cities[0]?.[0] || "";
  const citySearch = $("#idealCitySearch");
  const cityOptions = $("#idealCityOptions");
  const cityPicker = $("#idealCityPicker");
  const cityAliases = { "Баку": "baku", "Гянджа": "ganja gence", "Шеки": "sheki shaki", "Казань": "kazan", "Сочи": "sochi", "Тбилиси": "tbilisi", "Батуми": "batumi", "Москва": "moscow", "Санкт-Петербург": "saint petersburg spb", "Екатеринбург": "ekaterinburg" };
  // Нормализуем строку одинаково для запроса и названия: это убирает
  // различия регистра, "ё/е", пробелов, дефисов и невидимых символов.
  const norm = (v) => String(v ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^\\p{L}\\p{N}]+/gu, "");
  const closeCityOptions = () => { cityOptions.hidden = true; citySearch.setAttribute("aria-expanded", "false"); };
  const renderCityOptions = () => {
    // Берём актуальные города из select, а не полагаемся на устаревший снимок массива.
    const available = [...sel.options]
      .filter((option) => option.value)
      .map((option) => [option.value, Number((option.textContent.match(/\\((\\d+)\\)/) || [])[1]) || 0]);
    const q = norm(citySearch.value);
    const filtered = available.filter(([city]) => {
      if (!q) return true;
      const cityKey = norm(city);
      const aliasKey = String(cityAliases[city] || "").split(/\\s+/).map(norm).filter(Boolean);
      return cityKey.includes(q) || q.includes(cityKey) || aliasKey.some((alias) => alias.includes(q) || q.includes(alias));
    });
    cityOptions.innerHTML = filtered.length
      ? filtered.map(([city, count]) => `<button type="button" class="map-category-option" role="option" aria-selected="${sel.value === city}" data-ideal-city="${esc(city)}"><span>${esc(city)}</span><small>${count} мест</small></button>`).join("")
      : '<p class="muted" style="padding:8px 10px;font-size:12px">Город не найден. Попробуйте ввести первые буквы.</p>';
    cityOptions.hidden = false;
    citySearch.setAttribute("aria-expanded", "true");
  };
  citySearch.value = sel.value;
  citySearch.onfocus = renderCityOptions;
  citySearch.oninput = renderCityOptions;
  citySearch.onkeydown = (event) => {
    if (event.key === "Escape") { closeCityOptions(); citySearch.blur(); }
    if (event.key === "Enter") {
      event.preventDefault();
      const first = cityOptions.querySelector("[data-ideal-city]");
      if (first) first.click();
    }
  };
  cityOptions.onclick = (event) => {
    const option = event.target.closest("[data-ideal-city]");
    if (!option) return;
    sel.value = option.dataset.idealCity;
    citySearch.value = sel.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    closeCityOptions();
  };
  if (!cityPicker.dataset.bound) {
    document.addEventListener("click", (event) => { if (!cityPicker.contains(event.target)) closeCityOptions(); });
    cityPicker.dataset.bound = "true";
  }
  $("#idealMoods").innerHTML = Object.entries(MOODS).map(([k, m], i) =>
    `<label class="mood"><input type="radio" name="mood" value="${k}" ${i === 0 ? "checked" : ""}><span><strong>${esc(m.title)}</strong><small>${esc(m.hint)}</small></span></label>`).join("");
  $("#idealInterests").innerHTML = [["sights", "Достопримечательности"], ...VENUE_GROUPS.map((g) => [g.key, g.title])]
    .map(([k, t]) => `<label class="chip chip--check"><input type="checkbox" value="${k}"><span>${esc(t)}</span></label>`).join("");
  $("#idealAtm").innerHTML = Object.entries(ATMOSPHERES).map(([k, a]) => `<option value="${k}">${esc(a.title)}</option>`).join("");
  updateCurrency();
}
function updateCurrency() {
  const p = state.places.find((x) => x.city === $("#idealCity").value);
  $("#budgetCur").textContent = p ? currencyFor(p) : "";
}

/* ---------- Результат ---------- */
const clock = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;

function render() {
  const box = $("#idealResult");
  if (!current) { box.innerHTML = ""; return; }
  const { opts: o, stops } = current;
  const mood = MOODS[o.mood];
  if (!stops.length) {
    box.innerHTML = `<div class="card empty"><p>Для города «${esc(o.city)}» в каталоге пока недостаточно мест под такой сценарий. Выберите другое настроение или город.</p></div>`;
    return;
  }
  const cur = currencyFor(o.pool[0]);
  const priced = stops.filter((s) => s.place.price_min != null && currencyFor(s.place) === cur);
  const cost = priced.reduce((a, s) => a + Number(s.place.price_min), 0);
  const km = stops.reduce((a, s) => a + (s.travel?.km || 0), 0);
  const end = stops.at(-1).end;
  const warn = [];
  if (current.missing?.length) warn.push(`В каталоге для города «${o.city}» пока нет мест для этапов: ${current.missing.map((r) => ROLES[r].title.toLowerCase()).join(", ")}. Добавьте такие места в таблицу places.`);
  if (o.pool.length < 8) warn.push(`В каталоге для города «${o.city}» всего ${o.pool.length} мест, поэтому выбор ограничен.`);
  if (priced.length < stops.length) warn.push(`Стоимость указана не для всех мест (${priced.length} из ${stops.length}). Итог занижен.`);
  box.innerHTML = `
    <div class="ideal__head">
      <div><h3>${esc(mood.title)}, ${esc(o.city)}</h3>
        <p class="muted">${clock(stops[0].start)}–${clock(end)} · ${stops.length} остановок · ${fmtMin(end - stops[0].start)} · дорога ≈ ${fmtDist(km)} ${o.transport === "walk" ? "пешком" : "на авто"}${priced.length ? ` · ≈ ${(cost * o.people).toLocaleString("ru-RU")} ${cur} на ${o.people} чел.` : ""}</p></div>
      <div class="ideal__act">
        <button class="btn btn--sm" data-ideal="again">${icon("refresh")}Другой вариант</button>
        <button class="btn btn--sm btn--primary" data-ideal="plan">${icon("route")}В планировщик</button>
        <button class="btn btn--sm" data-ideal="save">${icon("bookmark")}Сохранить</button>
        <button class="btn btn--sm" data-ideal="share">${icon("share")}Поделиться</button>
      </div>
    </div>
    ${warn.map((w) => `<p class="note">${esc(w)}</p>`).join("")}
    <ol class="day">${stops.map((s, i) => {
      const p = s.place, c = cat(p), price = p.price_min == null ? "" : Number(p.price_min) === 0 ? "бесплатно" : `≈ ${Number(p.price_min).toLocaleString("ru-RU")} ${currencyFor(p)} на чел.`;
      return `<li class="day__item">
        <div class="day__time"><strong>${clock(s.start)}</strong><small>${fmtMin(s.visit)}</small></div>
        <article class="pcard pcard--row ${kindOf(p) === "sight" ? "pcard--sight" : ""}">
          ${cover(p)}
          <div class="pcard__body">
            <p class="pcard__meta"><span>${esc(ROLES[s.role].title)} · ${esc(c.title)}</span>${p.rating ? `<span class="rate">${icon("star")}${p.rating}</span>` : ""}</p>
            ${s.travel ? `<p class="day__travel">${icon(o.transport === "walk" ? "walk" : "car")}${fmtDist(s.travel.km)} · ${fmtMin(s.travel.min)} от предыдущей точки (оценка)</p>` : ""}
            <h3>${esc(p.title)}</h3>
            <p class="pcard__desc">${esc(p.description)}</p>
            ${p.address ? `<p class="pcard__addr">${icon("pin")}${esc(p.address)}</p>` : ""}
            <p class="pcard__facts">${icon("clock")}≈ ${fmtMin(s.visit)}<span>${icon("wallet")}${esc(price || "стоимость не указана")}</span></p>
            <div class="pcard__actions">
              <button class="btn btn--sm" data-ideal-swap="${i}">${icon("refresh")}Другое место</button>
              <button class="btn btn--sm" data-place-open="${p.id}">На карте</button>
              ${favBtnFn(p)}
            </div>
          </div>
        </article></li>`;
    }).join("")}</ol>`;
}
export const refreshIdeal = () => current && render();

export function initIdeal({ favBtn }) {
  favBtnFn = favBtn;
  renderIdealForm();
  $("#idealCity").addEventListener("change", () => { updateCurrency(); $("#idealCitySearch").value = $("#idealCity").value; });
  $("#idealForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const o = readForm();
    state.city = o.city;
    current = generate(o, Math.floor(Math.random() * 1e6));
    render();
    $("#idealResult").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#idealResult").addEventListener("click", (e) => {
    const t = e.target.closest("[data-ideal],[data-ideal-swap]");
    if (!t || !current) return;
    if (t.dataset.idealSwap != null) return swap(+t.dataset.idealSwap);
    const ids = current.stops.map((s) => s.place.id), mode = current.opts.transport;
    const name = `${MOODS[current.opts.mood].title}, ${current.opts.city}`;
    if (t.dataset.ideal === "again") { current = generate(current.opts, Math.floor(Math.random() * 1e6)); render(); }
    if (t.dataset.ideal === "plan") { setPlan(ids, mode, name); $("#planner").scrollIntoView({ behavior: "smooth" }); toast("Программа открыта в планировщике"); }
    if (t.dataset.ideal === "save") savePlanAs(ids, mode, name);
    if (t.dataset.ideal === "share") sharePlan(ids, mode, name);
  });
}
