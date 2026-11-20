// Общие помощники интерфейса: выборка элементов, иконки, экранирование, карточки мест, уведомления.
import { CATEGORIES } from "./data.js";
import { kindOf, groupOf, visitMinutes } from "./taxonomy.js";

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

/** Изображение места или цветная заглушка с иконкой категории (пока нет фото). */
export const cover = (p, cls = "cover") => {
  const c = cat(p);
  return p.image
    ? `<div class="${cls}"><img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" decoding="async"></div>`
    : `<div class="${cls} cover--art" style="--h:${c.hue}" aria-hidden="true">${icon(c.icon)}</div>`;
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
