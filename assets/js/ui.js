// Общие помощники интерфейса: выборка элементов, иконки, экранирование, карточки мест, уведомления.
import { CATEGORIES } from "./data.js?v=20261124n";
import { kindOf, groupOf, visitMinutes } from "./taxonomy.js?v=20261124n";

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const icon = (n) => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const telUrl = (n) => `tel:${String(n || "").replace(/[^\d+]/g, "")}`;
export const cat = (p) => CATEGORIES[p.category] || { title: "Место", icon: "pin", hue: 340, blurb: "" };

export const priceText = (p) => {
  if (p.price_min == null || p.price_max == null) return "";
  if (Number(p.price_min) === 0 && Number(p.price_max) === 0 && /бесплат/i.test(p.price_unit || "")) return "Вход бесплатный";
  const fmt = (v) => Number(v).toLocaleString("ru-RU");
  const amount = Number(p.price_min) === Number(p.price_max) ? fmt(p.price_min) : `${fmt(p.price_min)}–${fmt(p.price_max)}`;
  return `${amount} ${p.price_unit || ""}`.trim();
};
/** Короткая подпись цены для карточек: «от 7 AZN» или «Бесплатно». */
export const priceShort = (p) => {
  if (p.price_min == null) return "";
  if (Number(p.price_min) === 0) return "Бесплатно";
  return `от ${Number(p.price_min).toLocaleString("ru-RU")} ${(p.price_unit || "").split(/[\s,;:]/)[0]}`.trim();
};
export const fmtMin = (m) => (m < 60 ? `${Math.round(m)} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ` ${Math.round(m % 60)} мин` : ""}`);

/** Подбирает фотографию по названию места через Wikimedia Commons / Wikipedia. */
const photoPromises = new Map();
let photoActive = 0;
const photoWaiters = [];
const normalizePhotoText = (value) => String(value || "").toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[^a-zа-яё0-9]+/gi, " ").trim();
async function withPhotoSlot(task) {
  if (photoActive >= 3) await new Promise((resolve) => photoWaiters.push(resolve));
  photoActive++;
  try { return await task(); }
  finally { photoActive--; photoWaiters.shift()?.(); }
}
async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Image lookup failed");
  return response.json();
}
async function lookupPlacePhoto(title, city) {
  const cacheKey = `katyusha:photo:${normalizePhotoText(title)}:${normalizePhotoText(city)}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached === "none") return null;
    if (cached) return cached;
  } catch {}
  const query = `${title} ${city}`.trim();
  // Сначала ищем фотографию непосредственно в Wikimedia Commons.
  try {
    const url = "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=8&gsrsearch=" +
      encodeURIComponent(query) + "&prop=imageinfo&iiprop=url&iiurlwidth=1000&format=json&origin=*";
    const data = await fetchJson(url);
    const pages = Object.values(data.query?.pages || []);
    const tokens = normalizePhotoText(title).split(" ").filter((x) => x.length > 3);
    const cityTokens = normalizePhotoText(city).split(" ").filter((x) => x.length > 3);
    const ranked = pages.map((page) => {
      const name = normalizePhotoText(page.title);
      const titleScore = tokens.reduce((n, token) => n + (name.includes(token) ? 1 : 0), 0);
      const cityScore = cityTokens.reduce((n, token) => n + (name.includes(token) ? 1 : 0), 0);
      return { page, titleScore, cityScore, score: titleScore * 2 + cityScore };
    }).sort((a, b) => b.score - a.score);
    // Не берём случайную картинку только из-за одного общего слова.
    const best = ranked[0];
    const image = best && best.titleScore >= Math.min(2, tokens.length) && (cityTokens.length === 0 || best.cityScore > 0)
      ? best.page.imageinfo?.[0]?.thumburl : null;
    if (image) { try { localStorage.setItem(cacheKey, image); } catch {} return image; }
  } catch {}
  // Если в Commons нет подходящего файла, используем миниатюру статьи Wikipedia.
  for (const language of ["ru", "en"]) {
    try {
      const url = `https://${language}.wikipedia.org/w/api.php?action=query&generator=search&gsrnamespace=0&gsrlimit=5&gsrsearch=` +
        encodeURIComponent(query) + "&prop=pageimages&piprop=thumbnail&pithumbsize=1000&format=json&origin=*";
      const data = await fetchJson(url);
      const pages = Object.values(data.query?.pages || []);
      const titleTokens = normalizePhotoText(title).split(" ").filter((x) => x.length > 3);
      const cityTokens = normalizePhotoText(city).split(" ").filter((x) => x.length > 3);
      const ranked = pages.map((page) => {
        const name = normalizePhotoText(page.title);
        const titleScore = titleTokens.reduce((n, token) => n + (name.includes(token) ? 1 : 0), 0);
        const cityScore = cityTokens.reduce((n, token) => n + (name.includes(token) ? 1 : 0), 0);
        return { page, titleScore, cityScore, score: titleScore * 2 + cityScore };
      }).sort((a, b) => b.score - a.score);
      const best = ranked[0];
      const image = best && best.titleScore >= Math.min(2, titleTokens.length) && (cityTokens.length === 0 || best.cityScore > 0)
        ? best.page.thumbnail?.source : null;
      if (image) { try { localStorage.setItem(cacheKey, image); } catch {} return image; }
    } catch {}
  }
  try { localStorage.setItem(cacheKey, "none"); } catch {}
  return null;
}
export function hydratePhotos(root = document) {
  root.querySelectorAll(".cover--art[data-photo-title]").forEach((node) => {
    if (node.dataset.photoLoading) return;
    node.dataset.photoLoading = "true";
    const key = `${node.dataset.photoTitle}|${node.dataset.photoCity}`;
    if (!photoPromises.has(key)) {
      photoPromises.set(key, withPhotoSlot(() => lookupPlacePhoto(node.dataset.photoTitle, node.dataset.photoCity)));
    }
    photoPromises.get(key).then((url) => {
      if (!url || !node.isConnected) return;
      const placeholder = node.innerHTML;
      const img = document.createElement("img");
      img.src = url;
      img.alt = `${node.dataset.photoTitle} — ${node.dataset.photoCity}`;
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", () => {
        node.classList.add("cover--art", "cover--art--failed");
        node.replaceChildren();
        node.innerHTML = placeholder;
        const cacheKey = `katyusha:photo:${normalizePhotoText(node.dataset.photoTitle)}:${normalizePhotoText(node.dataset.photoCity)}`;
        try { localStorage.removeItem(cacheKey); } catch {}
      }, { once: true });
      node.replaceChildren(img);
      node.classList.remove("cover--art");
    }).catch(() => {});
  });
}

/** Изображение места. Если локального фото нет, оно подбирается автоматически по названию. */
export const cover = (p, cls = "cover") => {
  const c = cat(p);
  return p.image
    ? `<div class="${cls}"><img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" decoding="async"></div>`
    : `<div class="${cls} cover--art" style="--h:${c.hue}" data-photo-title="${esc(p.title)}" data-photo-city="${esc(p.city || "")}" aria-hidden="true">${icon(c.icon)}</div>`;
};

/** Карточка места. large = крупная карточка достопримечательности. favBtn передаётся из app.js. */
export function placeCard(p, favBtn, { large = false } = {}) {
  const c = cat(p), price = priceShort(p), sight = kindOf(p) === "sight";
  return `<article class="pcard ${large ? "pcard--lg" : ""} ${sight ? "pcard--sight" : ""}">
    ${cover(p)}
    <div class="pcard__body">
      <p class="pcard__meta"><span>${esc(groupOf(p)?.title || c.title)}</span>${p.rating ? `<span class="rate">${icon("star")}${p.rating}</span>` : ""}</p>
      <h3>${esc(p.title)}</h3>
      <p class="pcard__desc">${esc(p.description)}</p>
      ${p.address ? `<p class="pcard__addr">${icon("pin")}${esc(p.address)}</p>` : ""}
      <p class="pcard__facts">${icon("clock")}≈ ${fmtMin(visitMinutes(p))}${price ? `<span>${icon("wallet")}${esc(price)}</span>` : ""}</p>
      <div class="pcard__actions">
        <button class="btn btn--sm btn--primary" data-plan-add="${p.id}">${icon("plus")}В маршрут</button>
        <button class="btn btn--sm" data-place-open="${p.id}">На карте</button>
        ${favBtn(p)}
      </div>
    </div></article>`;
}

/* Уведомления */
let timer;
export function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove("show"), 2600);
}
