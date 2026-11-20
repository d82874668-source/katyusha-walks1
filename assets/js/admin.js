import { CONFIG } from "./config.js";
const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const count = async (q) => (await q).count ?? 0;
const table = (rows, cols) => rows.length ? `<table><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</table>` : `<p class="muted">Пока пусто.</p>`;

async function show() {
  const { data: { session } } = await sb.auth.getSession();
  $("#login").hidden = !!session; $("#app").hidden = !session;
  if (!session) return;
  const { data: adm } = await sb.rpc("is_admin");
  if (!adm) { $("#app").hidden = true; $("#login").hidden = false; $("#lerr").textContent = "Этот пользователь не администратор."; return; }
  $("#who").textContent = session.user.email;
  const head = (t) => sb.from("places").select("*", { count: "exact", head: true });
  const [total, noCoord, noPhoto, review, photos] = await Promise.all([
    count(head()), count(head().is("latitude", null)), count(head().is("image", null)), count(head().eq("status", "needs_review")),
    count(sb.from("place_photos").select("*", { count: "exact", head: true })),
  ]);
  const kpi = (t, v) => `<div class="kpi"><b>${v}</b>${t}</div>`;
  $("#kpis").innerHTML = kpi("всего объектов", total) + kpi("без координат", noCoord) + kpi("без фото", noPhoto) + kpi("на проверке", review) + kpi("фото в place_photos", photos);
  const { data: all } = await sb.from("places").select("region,category").limit(10000);
  const grp = (k) => Object.entries((all ?? []).reduce((m, p) => (m[p[k] ?? "—"] = (m[p[k] ?? "—"] || 0) + 1, m), {}));
  $("#byRegion").innerHTML = grp("region").map(([k, v]) => kpi(k, v)).join("");
  $("#byCat").innerHTML = grp("category").map(([k, v]) => kpi(k, v)).join("");
  const { data: src } = await sb.from("data_sources").select("name,source_type,enabled,status,last_sync_at,notes");
  $("#sources").innerHTML = table((src ?? []).map((s) => [s.name, s.source_type, s.enabled ? "включён" : "отключён", s.status, s.last_sync_at ?? "—", s.notes]), ["Источник", "Тип", "Вкл", "Статус", "Последний запуск", "Заметка"]);
  const { data: logs } = await sb.from("sync_logs").select("*").order("started_at", { ascending: false }).limit(15);
  $("#logs").innerHTML = table((logs ?? []).map((l) => [l.started_at, l.action, l.status, l.found_count, l.added_count, l.updated_count, l.duplicate_count, l.error_count, l.error_details ?? ""]), ["Запуск", "Действие", "Статус", "Найдено", "Добавлено", "Обновлено", "Дубли", "Ошибки", "Детали"]);
  const { data: q } = await sb.from("place_review_queue").select("id,reason,candidate,state").eq("state", "pending").limit(30);
  $("#queue").innerHTML = table((q ?? []).map((r) => [r.id, r.reason, r.candidate?.title ?? "", r.state]), ["ID", "Причина", "Название", "Статус"]);
  window.__logs = logs ?? [];
  await loadPlaceOptions();
}
$("#go").onclick = async () => {
  const { error } = await sb.auth.signInWithPassword({ email: $("#em").value, password: $("#pw").value });
  $("#lerr").textContent = error ? "Не удалось войти: " + error.message : ""; show();
};
$("#out").onclick = async () => { await sb.auth.signOut(); show(); };
$("#reload").onclick = show;
document.querySelectorAll("[data-act]").forEach((b) => b.onclick = async () => {
  let action = b.dataset.act; if (action === "retry") action = window.__logs?.find((l) => l.status !== "ok")?.action || "discover";
  $("#msg").textContent = "Выполняется… это может занять несколько минут."; b.disabled = true;
  const { data, error } = await sb.functions.invoke("sync-osm", { body: { action } });
  $("#msg").textContent = error ? "Ошибка: " + error.message : `Готово: ${JSON.stringify(data)}`; b.disabled = false; show();
});

let editorPlaces = [];
let selectedPlaceId = null;
const editor = $("#placeEditor");
const editorField = (name) => editor.elements.namedItem(name);
const nullableText = (value) => value.trim() || null;
const nullableNumber = (value) => value === "" ? null : Number(value);

async function loadPlaceOptions() {
  const { data, error } = await sb.from("places").select("*").order("city").order("title").limit(10000);
  if (error) { $("#placeSaveMsg").textContent = "Не удалось загрузить каталог: " + error.message; return; }
  editorPlaces = data || [];
  const query = ($("#placeSearch").value || "").trim().toLocaleLowerCase("ru");
  const filtered = editorPlaces.filter((p) => !query || [p.title,p.city,p.region,p.address].filter(Boolean).join(" ").toLocaleLowerCase("ru").includes(query));
  $("#placeSelect").innerHTML = '<option value="">Выберите объект</option>' + filtered.map((p) =>
    `<option value="${p.id}">${esc(p.title)} — ${esc(p.city || p.region || "город не указан")}</option>`
  ).join("");
  if (selectedPlaceId && filtered.some((p) => String(p.id) === String(selectedPlaceId))) $("#placeSelect").value = String(selectedPlaceId);
}

function fillPlaceEditor(place) {
  selectedPlaceId = place?.id ?? null;
  editor.hidden = !place;
  if (!place) { $("#placePhotos").textContent = "Выберите объект."; return; }
  for (const name of ["title","official_name","city","region","country","category","subcategory","address","description","latitude","longitude","image","rating","review_count","rating_source","price_min","price_max","price_unit","opening_hours","phone","website","map_url","verification_status","avg_check","price_source"]) {
    editorField(name).value = place[name] ?? "";
  }
  editorField("source_urls").value = (place.source_urls || []).join("\n");
  editorField("is_approx").checked = !!place.is_approx;
  editorField("last_verified_at").value = place.last_verified_at ? String(place.last_verified_at).slice(0,10) : "";
  editorField("social_links").value = JSON.stringify(place.social_links || {}, null, 2);
  editorField("features").value = JSON.stringify(place.features || {}, null, 2);
  $("#placeSaveMsg").textContent = "";
  loadPlacePhotos();
}

async function loadPlacePhotos() {
  if (!selectedPlaceId) return;
  const { data, error } = await sb.from("place_photos").select("id,url,license,attribution").eq("place_id", selectedPlaceId).order("id");
  $("#placePhotos").innerHTML = error ? esc(error.message) : (data?.length ? data.map((p) =>
    `<div class="row2" style="align-items:center"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url.slice(0,90))}</a><small class="muted">${esc(p.license)} · ${esc(p.attribution || "автор не указан")}</small><button class="btn" type="button" data-delete-photo="${p.id}">Удалить</button></div>`
  ).join("") : "Дополнительные фотографии не добавлены.");
}

$("#placeSearch").addEventListener("input", loadPlaceOptions);
$("#placeSelect").addEventListener("change", () => {
  const place = editorPlaces.find((p) => String(p.id) === $("#placeSelect").value);
  fillPlaceEditor(place);
});

editor.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedPlaceId) return;
  const form = event.currentTarget;
  const save = form.querySelector('[type="submit"]');
  const payload = {
    title: editorField("title").value.trim(),
    official_name: nullableText(editorField("official_name").value),
    city: nullableText(editorField("city").value),
    region: nullableText(editorField("region").value),
    country: nullableText(editorField("country").value),
    category: editorField("category").value.trim(),
    subcategory: nullableText(editorField("subcategory").value),
    address: nullableText(editorField("address").value),
    description: nullableText(editorField("description").value),
    latitude: nullableNumber(editorField("latitude").value),
    longitude: nullableNumber(editorField("longitude").value),
    image: nullableText(editorField("image").value),
    rating: nullableNumber(editorField("rating").value),
    review_count: nullableNumber(editorField("review_count").value),
    rating_source: nullableText(editorField("rating_source").value),
    price_min: nullableNumber(editorField("price_min").value),
    price_max: nullableNumber(editorField("price_max").value),
    price_unit: nullableText(editorField("price_unit").value),
    opening_hours: nullableText(editorField("opening_hours").value),
    phone: nullableText(editorField("phone").value),
    website: nullableText(editorField("website").value),
    map_url: nullableText(editorField("map_url").value),
    verification_status: editorField("verification_status").value.trim() || "unverified",
    is_approx: editorField("is_approx").checked,
    avg_check: nullableNumber(editorField("avg_check").value),
    price_source: nullableText(editorField("price_source").value),
    last_verified_at: editorField("last_verified_at").value ? new Date(editorField("last_verified_at").value + "T12:00:00Z").toISOString() : null,
    social_links: {},
    features: {},
    source_urls: editorField("source_urls").value.split("\n").map((x) => x.trim()).filter(Boolean),
    updated_at: new Date().toISOString()
  };
  try {
    payload.social_links = JSON.parse(editorField("social_links").value || "{}");
    payload.features = JSON.parse(editorField("features").value || "{}");
    if (!payload.social_links || Array.isArray(payload.social_links) || typeof payload.social_links !== "object") throw new Error("Соцсети должны быть JSON-объектом.");
    if (!payload.features || Array.isArray(payload.features) || typeof payload.features !== "object") throw new Error("Характеристики должны быть JSON-объектом.");
  } catch (error) { $("#placeSaveMsg").textContent = "Проверьте JSON: " + error.message; return; }
  if (!payload.title || !payload.category) { $("#placeSaveMsg").textContent = "Название и категория обязательны."; return; }
  if ((payload.latitude == null) !== (payload.longitude == null) ||
      (payload.latitude != null && (payload.latitude < -90 || payload.latitude > 90 || payload.longitude < -180 || payload.longitude > 180))) {
    $("#placeSaveMsg").textContent = "Проверьте координаты: широта −90…90, долгота −180…180."; return;
  }
  if (payload.avg_check != null && payload.avg_check < 0) { $("#placeSaveMsg").textContent = "Средний чек не может быть отрицательным."; return; }
  if (payload.rating != null && (payload.rating < 0 || payload.rating > 5)) { $("#placeSaveMsg").textContent = "Рейтинг должен быть от 0 до 5."; return; }
  if (payload.price_min != null && payload.price_max != null && payload.price_min > payload.price_max) { $("#placeSaveMsg").textContent = "Цена «от» не может быть больше цены «до»."; return; }
  save.disabled = true; $("#placeSaveMsg").textContent = "Сохраняем…";
  const { error } = await sb.from("places").update(payload).eq("id", selectedPlaceId);
  save.disabled = false;
  $("#placeSaveMsg").textContent = error ? "Ошибка: " + error.message : "Карточка сохранена.";
  if (!error) { await loadPlaceOptions(); fillPlaceEditor(editorPlaces.find((p) => p.id === selectedPlaceId)); }
});

$("#addPlacePhoto").addEventListener("click", async () => {
  if (!selectedPlaceId) { $("#placeSaveMsg").textContent = "Сначала выберите объект."; return; }
  const url = $("#photoUrl").value.trim(), license = $("#photoLicense").value.trim(), attribution = $("#photoAttribution").value.trim();
  try { new URL(url); } catch { $("#placeSaveMsg").textContent = "Укажите корректную ссылку на фото."; return; }
  if (!license) { $("#placeSaveMsg").textContent = "Укажите лицензию или условия использования фотографии."; return; }
  const { error } = await sb.from("place_photos").insert({ place_id: selectedPlaceId, url, license, attribution: attribution || null });
  $("#placeSaveMsg").textContent = error ? "Ошибка: " + error.message : "Фотография добавлена.";
  if (!error) { $("#photoUrl").value = ""; await loadPlacePhotos(); }
});

$("#placePhotos").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-photo]");
  if (!button) return;
  if (!confirm("Удалить эту фотографию из карточки?")) return;
  const { error } = await sb.from("place_photos").delete().eq("id", Number(button.dataset.deletePhoto));
  $("#placeSaveMsg").textContent = error ? "Ошибка: " + error.message : "Фотография удалена.";
  if (!error) loadPlacePhotos();
});

show();
