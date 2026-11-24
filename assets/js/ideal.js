// «Мой идеальный день»: подбор программы по настроению, городу, бюджету, времени и интересам.
// Алгоритм детерминирован при одном seed и не использует внешние сервисы: работает офлайн на данных каталога.
import { state } from "./state.js?v=20261124r";
import { PLACES } from "./data.js?v=20261124mapcategories";
import { $, $$, icon, esc, cat, cover, toast, fmtMin } from "./ui.js?v=20261124n";
import { MOODS, ROLES, ATMOSPHERES, VENUE_GROUPS, kindOf, groupOf, visitMinutes, currencyFor } from "./taxonomy.js?v=20261124idealfallback";
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
    (!ROLES[role].cats.length || ROLES[role].cats.includes(p.category)) && !used.has(String(p.id)) && !exclude.has(String(p.id)) && !brands.has(brand(p)) &&
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
  // Подбор должен использовать тот же объединённый каталог, что и поиск города.
  // Supabase может вернуть неполный набор/вариант написания города; локальный
  // каталог остаётся резервом, а одинаковые ID не дублируются.
  const allPlaces = new Map();
  for (const place of [...PLACES, ...(Array.isArray(state.places) ? state.places : [])]) {
    if (!place || place.id == null) continue;
    const key = String(place.id);
    const previous = allPlaces.get(key);
    // Предпочитаем актуальную запись из state (Supabase), но сохраняем
    // резервную локальную запись, если в API нет этой точки.
    allPlaces.set(key, previous ? { ...place, ...previous } : place);
  }
  const targetCity = normalizeCity(o.city);
  const targetAliases = (CITY_ALIASES[o.city] || []).map(normalizeCity);
  const cityMatches = (value) => {
    const key = normalizeCity(value);
    return key === targetCity || targetAliases.includes(key) ||
      (targetAliases.some((alias) => alias === key));
  };
  o.pool = [...allPlaces.values()].filter((p) =>
    cityMatches(p.city) && Number.isFinite(Number(p.latitude)) &&
    Number.isFinite(Number(p.longitude)) && String(p.latitude).trim() !== "" &&
    String(p.longitude).trim() !== ""
  );
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
  // Если сценарий не нашёл профильных категорий, предлагаем универсальные места города.
  if (!stops.length && o.pool.length) {
    const cur = currencyFor(o.pool[0]);
    const fallback = o.pool
      .filter((p) => !(o.budget != null && p.price_min != null && currencyFor(p) === cur && Number(p.price_min) > o.budget))
      .map((p) => [p, score(p, "discover", null, o, rand)])
      .sort((a, b) => b[1] - a[1]);
    const count = Math.min(3, fallback.length, Math.max(1, Math.floor(limit / 120)));
    for (const [place] of fallback.slice(0, count)) stops.push({ place, role: "discover" });
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
const CITY_ALIASES = {
  "Баку": ["baku"], "Гянджа": ["ganja", "gence"], "Шеки": ["sheki", "shaki"],
  "Казань": ["kazan"], "Сочи": ["sochi"], "Тбилиси": ["tbilisi"],
  "Батуми": ["batumi"], "Москва": ["moscow"],
  "Санкт-Петербург": ["saintpetersburg", "saint petersburg", "petersburg", "spb"],
  "Екатеринбург": ["ekaterinburg"]
};
const normalizeCity = (value) => String(value ?? "")
  .normalize("NFKC")
  .toLocaleLowerCase("ru")
  .replace(/ё/g, "е")
  .replace(/[^\p{L}\p{N}]+/gu, "");

function matchCity(query, cities) {
  const q = normalizeCity(query);
  if (!q) return null;
  const matches = cities.filter(([city]) => {
    const name = normalizeCity(city);
    const aliases = (CITY_ALIASES[city] || []).map(normalizeCity);
    return name.includes(q) || aliases.some((alias) => alias.includes(q));
  });
  matches.sort(([a], [b]) => {
    const rank = (city) => {
      const name = normalizeCity(city);
      if (name === q) return 0;
      if (name.startsWith(q)) return 1;
      if (name.includes(q)) return 2;
      const aliases = (CITY_ALIASES[city] || []).map(normalizeCity);
      return aliases.some((alias) => alias === q) ? 3 : 4;
    };
    return rank(a) - rank(b) || a.localeCompare(b, "ru");
  });
  return matches[0] || null;
}

function availableCities() {
  // Объединяем актуальные данные API и локальный каталог. Если API временно
  // вернул пустой/неполный список, города из встроенной базы не исчезают.
  const merged = [...(Array.isArray(state.places) ? state.places : []), ...PLACES];
  const byCity = new Map();
  for (const place of merged) {
    const city = String(place?.city || "").trim();
    const key = normalizeCity(city);
    if (!city || !key) continue;
    if (!byCity.has(key)) byCity.set(key, { city, ids: new Set() });
    const entry = byCity.get(key);
    if (place.id != null) entry.ids.add(String(place.id));
    else entry.ids.add(`fallback-${entry.ids.size}`);
  }
  return [...byCity.values()]
    .map(({ city, ids }) => [city, ids.size])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
}

function readForm() {
  const f = $("#idealForm"), data = new FormData(f);
  const budget = data.get("budget") === "" ? null : Number(data.get("budget"));
  const citySearch = $("#idealCitySearch");
  const typedCity = citySearch.value.trim();
  const cities = availableCities();
  const matchedCity = matchCity(typedCity, cities);
  const city = typedCity ? matchedCity?.[0] || "" : data.get("city") || "";
  if (city) {
    $("#idealCity").value = city;
    citySearch.value = city;
    $("#idealCity").dispatchEvent(new Event("change", { bubbles: true }));
  }
  return {
    mood: data.get("mood") || "romantic", city, cityQuery: typedCity, cityResolved: Boolean(city),
    budget: Number.isFinite(budget) ? budget : null,
    hours: Number(data.get("hours")), people: Math.max(1, Number(data.get("people")) || 1),
    transport: data.get("transport"), atmosphere: data.get("atmosphere") || "any",
    interests: new Set($$('#idealInterests input:checked').map((i) => i.value)),
  };
}

export function renderIdealForm() {
  const cities = availableCities();
  const sel = $("#idealCity");
  const citySearch = $("#idealCitySearch");
  const cityOptions = $("#idealCityOptions");
  const cityPicker = $("#idealCityPicker");
  const searchWasFocused = document.activeElement === citySearch;
  const previousQuery = searchWasFocused ? citySearch.value : "";
  sel.innerHTML = cities.map(([city, count]) => `<option value="${esc(city)}">${esc(city)} (${count})</option>`).join("");
  sel.value = cities.some(([city]) => city === state.city) ? state.city : cities[0]?.[0] || "";

  // Все варианты строятся из актуального state.places (включая данные API).
  const closeCityOptions = () => {
    cityOptions.hidden = true;
    citySearch.setAttribute("aria-expanded", "false");
  };
  const renderCityOptions = () => {
    const query = citySearch.value;
    const q = normalizeCity(query);
    const matched = q ? cities.filter(([city]) => {
      const name = normalizeCity(city);
      const aliases = (CITY_ALIASES[city] || []).map(normalizeCity);
      return name.includes(q) || aliases.some((alias) => alias.includes(q));
    }) : cities;
    const best = matchCity(query, cities);
    if (query.trim()) {
      sel.value = best?.[0] || "";
      updateCurrency();
    }
    const filtered = best
      ? [...matched].sort(([a], [b]) => a === best[0] ? -1 : b === best[0] ? 1 : 0)
      : matched;
    cityOptions.innerHTML = filtered.length
      ? filtered.map(([city, count]) => `<button type="button" class="map-category-option" role="option" aria-selected="${sel.value === city}" data-ideal-city="${esc(city)}"><span>${esc(city)}</span><small>${count} мест</small></button>`).join("")
      : '<p class="muted" style="padding:8px 10px;font-size:12px">Город не найден. Попробуйте изменить запрос.</p>';
    cityOptions.hidden = false;
    citySearch.setAttribute("aria-expanded", "true");
  };
  citySearch.value = searchWasFocused ? previousQuery : sel.value;
  if (citySearch.value) {
    const initialMatch = matchCity(citySearch.value, cities);
    if (initialMatch) sel.value = initialMatch[0];
  }
  citySearch.onfocus = () => {
    // При первом клике выделяем текущее название, чтобы новый ввод заменял его,
    // а не склеивался с ним (например, «БакуМосква»).
    citySearch.select();
    renderCityOptions();
  };
  citySearch.oninput = () => {
    renderCityOptions();
    // Автоматически фиксируем лучший результат даже без клика по подсказке.
    const best = matchCity(citySearch.value, cities);
    if (citySearch.value.trim() && best) {
      sel.value = best[0];
      updateCurrency();
    }
  };
  citySearch.onkeydown = (event) => {
    if (event.key === "Escape") { closeCityOptions(); citySearch.blur(); }
    if (event.key === "Enter") {
      event.preventDefault();
      const best = matchCity(citySearch.value, cities);
      if (best) {
        sel.value = best[0];
        citySearch.value = best[0];
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        closeCityOptions();
      }
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
    const message = !o.pool.length
      ? `В каталоге пока нет мест для города «${esc(o.city)}». Выберите другой город или попробуйте позже.`
      : o.budget != null
        ? `Не удалось подобрать места для города «${esc(o.city)}» в указанном бюджете. Увеличьте бюджет или уберите ограничение.`
        : `В каталоге города «${esc(o.city)}» пока недостаточно данных для этой программы. Попробуйте другой сценарий.`;
    box.innerHTML = `<div class="card empty"><p>${message}</p></div>`;
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
    if (!o.cityResolved) {
      const query = o.cityQuery || "не указан";
      $("#idealResult").innerHTML = `<div class="card empty"><p>Не удалось распознать город «${esc(query)}». Введите название или выберите город из подсказок.</p></div>`;
      $("#idealResult").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
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
