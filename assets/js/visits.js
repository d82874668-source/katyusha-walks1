import { CONFIG } from "./config.js";

const KEY = "katyusha:visits:v1";
const DELETED_KEY = "katyusha:visits-deleted:v1";
const SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
let clientPromise;

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
};
const readDeleted = () => { try { return JSON.parse(localStorage.getItem(DELETED_KEY) || "[]"); } catch { return []; } };
const writeDeleted = (ids) => { try { localStorage.setItem(DELETED_KEY, JSON.stringify([...new Set(ids)])); } catch {} };
const write = (items) => {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage quota/private mode */ }
};
const uuid = () => crypto.randomUUID?.() || "visit-" + Date.now() + "-" + Math.random().toString(36).slice(2);

async function client() {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return null;
  if (!clientPromise) clientPromise = import(SDK).then(({ createClient }) =>
    createClient(String(CONFIG.SUPABASE_URL).replace(/\/+$/, ""), CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  ).catch(() => null);
  return clientPromise;
}

async function ensureSession(sb) {
  let { data: { session } } = await sb.auth.getSession();
  if (!session) {
    const result = await sb.auth.signInAnonymously();
    if (result.error) throw result.error;
    session = result.data.session;
  }
  return session;
}

async function compressPhoto(file) {
  if (!file) return null;
  if (!file.type.startsWith("image/")) throw new Error("Можно прикрепить только изображение.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Исходное фото больше 15 МБ.");
  if (!("createImageBitmap" in window)) return file;
  const bitmap = await createImageBitmap(file);
  const max = 1280, scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.72));
}

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});
const dataUrlToBlob = (value) => {
  if (!value || typeof value !== "string" || !value.startsWith("data:")) return null;
  const [head, body] = value.split(",");
  const mime = head.match(/data:([^;]+)/)?.[1] || "image/jpeg";
  const binary = atob(body);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mime });
};

async function syncVisit(visit) {
  if (!navigator.onLine) return false;
  const sb = await client();
  if (!sb) return false;
  try {
    const session = await ensureSession(sb);
    let photoPath = visit.photo_path || null;
    const uploadBlob = visit.photo_blob || dataUrlToBlob(visit.photo_data);
    if (uploadBlob) {
      const mime = uploadBlob.type || "image/jpeg";
      const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
      photoPath = `${session.user.id}/${visit.id}.${ext}`;
      const { error: uploadError } = await sb.storage.from("visit-photos").upload(photoPath, uploadBlob, {
        contentType: mime, upsert: true
      });
      if (uploadError) throw uploadError;
    }
    const { error } = await sb.from("place_visits").upsert({
      id: visit.id, user_id: session.user.id, place_id: visit.place_id,
      visit_date: visit.visit_date, impression: visit.impression || null,
      rating: visit.rating || null, mood_tags: visit.mood_tags || [], photo_path: photoPath
    }, { onConflict: "id" });
    if (error) throw error;
    const local = read().map((v) => v.id === visit.id ? { ...v, photo_path: photoPath, photo_blob: null, synced: true } : v);
    write(local);
    return true;
  } catch (error) {
    console.warn("Посещение сохранено локально; синхронизация отложена:", error);
    return false;
  }
}

export function getVisits(placeId) {
  return read().filter((v) => String(v.place_id) === String(placeId))
    .sort((a, b) => b.visit_date.localeCompare(a.visit_date));
}

export async function saveVisit(data) {
  const items = read();
  const id = data.id || uuid();
  const photo = await compressPhoto(data.photo_file);
  const photoData = photo ? await blobToDataUrl(photo) : data.photo_data || null;
  const visit = {
    id, place_id: Number(data.place_id), visit_date: data.visit_date,
    impression: String(data.impression || "").slice(0, 5000),
    rating: data.rating ? Number(data.rating) : null,
    mood_tags: [], photo_data: photoData, photo_url: photoData || data.photo_url || null,
    photo_path: data.photo_path || null, synced: false
  };
  const idx = items.findIndex((v) => v.id === id);
  if (idx >= 0) items[idx] = visit; else items.push(visit);
  write(items);
  const synced = await syncVisit(visit);
  return { ...visit, synced };
}

export async function deleteVisit(id) {
  const items = read();
  const visit = items.find((v) => v.id === id);
  write(items.filter((v) => v.id !== id));
  writeDeleted([...readDeleted(), id]);
  if (!visit || !navigator.onLine) return true;
  const sb = await client();
  if (!sb) return true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return true;
    if (visit.photo_path) await sb.storage.from("visit-photos").remove([visit.photo_path]);
    const { error } = await sb.from("place_visits").delete().eq("id", id).eq("user_id", session.user.id);
    return !error;
  } catch { return false; }
}

export async function hydrateVisits() {
  if (!navigator.onLine) return;
  const sb = await client();
  if (!sb) return;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const { data, error } = await sb.from("place_visits").select("*").eq("user_id", session.user.id).order("visit_date", { ascending: false });
    if (error) throw error;
    const local = read();
    const localById = new Map(local.map((v) => [v.id, v]));
    const deleted = new Set(readDeleted());
    const remote = [];
    for (const row of data || []) {
      if (deleted.has(row.id)) continue;
      const cached = localById.get(row.id);
      let photoUrl = cached?.photo_url || null;
      if (row.photo_path && !cached?.photo_data) {
        const { data: signed } = await sb.storage.from("visit-photos").createSignedUrl(row.photo_path, 3600);
        photoUrl = signed?.signedUrl || photoUrl;
      }
      remote.push({
        id: row.id, place_id: row.place_id, visit_date: row.visit_date,
        impression: row.impression || "", rating: row.rating, mood_tags: row.mood_tags || [],
        photo_path: row.photo_path, photo_url: photoUrl, photo_data: cached?.photo_data || null,
        synced: true, created_at: row.created_at, updated_at: row.updated_at
      });
    }
    const remoteIds = new Set(remote.map((v) => v.id));
    const merged = [...remote.map((v) => {
      const cached = localById.get(v.id);
      return cached && !cached.synced ? cached : { ...v, ...(cached?.photo_data ? { photo_data: cached.photo_data, photo_url: cached.photo_data } : {}) };
    }), ...local.filter((v) => !remoteIds.has(v.id))];
    write(merged);
    document.dispatchEvent(new CustomEvent("katyusha:visits-changed"));
  } catch (error) {
    console.warn("Не удалось загрузить историю посещений из Supabase:", error);
  }
}

export async function syncPendingVisits() {
  if (!navigator.onLine) return;
  const sb = await client();
  if (sb) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session) {
        const deleted = readDeleted();
        for (const id of deleted) {
          await sb.from("place_visits").delete().eq("id", id).eq("user_id", session.user.id);
        }
        writeDeleted([]);
      }
    } catch (error) { console.warn("Не удалось синхронизировать удаления посещений:", error); }
  }
  for (const visit of read().filter((v) => !v.synced)) await syncVisit(visit);
}

export function visitDialog(place, existing = null) {
  const dialog = document.createElement("dialog");
  dialog.style.cssText = "max-width:min(520px,calc(100vw - 24px));width:100%;border:1px solid var(--line);border-radius:20px;padding:22px;background:var(--surface);color:var(--ink);box-shadow:0 24px 80px rgba(0,0,0,.25)";
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  dialog.innerHTML = `
    <form method="dialog" class="visit-form">
      <h2 style="margin:0 0 6px">${existing ? "Изменить посещение" : "Были здесь"}</h2>
      <p class="muted" style="margin:0 0 16px">${escapeHtml(place.title)}</p>
      <label style="display:block;margin:12px 0 6px">Дата посещения</label>
      <input name="visit_date" type="date" required value="${escapeHtml(existing?.visit_date || today)}" style="width:100%;padding:11px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);color:var(--ink)">
      <label style="display:block;margin:12px 0 6px">Общее впечатление</label>
      <textarea name="impression" maxlength="5000" rows="4" placeholder="Что понравилось? Что стоит запомнить?" style="width:100%;box-sizing:border-box;padding:11px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);color:var(--ink);font:inherit">${escapeHtml(existing?.impression || "")}</textarea>
      <label style="display:block;margin:12px 0 6px">Ваша оценка</label>
      <select name="rating" style="width:100%;padding:11px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);color:var(--ink)">
        <option value="">Без оценки</option>${[5,4,3,2,1].map((n) => `<option value="${n}" ${Number(existing?.rating) === n ? "selected" : ""}>${"★".repeat(n)} (${n}/5)</option>`).join("")}
      </select>
      <label style="display:block;margin:12px 0 6px">Фото с посещения</label>
      <input name="photo" type="file" accept="image/*" capture="environment" style="width:100%">
      ${existing?.photo_url ? `<p class="muted">Фото уже прикреплено. Выберите новый файл, чтобы заменить его.</p>` : ""}
      <p class="muted" style="font-size:12px">Запись сохраняется на этом устройстве и синхронизируется при подключении к интернету и доступной анонимной авторизации Supabase.</p>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px">
        <button type="button" data-cancel class="btn">Отмена</button>
        <button type="submit" class="btn btn--primary">${existing ? "Сохранить" : "Отметить посещение"}</button>
      </div>
    </form>`;
  document.body.append(dialog);
  dialog.addEventListener("click", (e) => { if (e.target === dialog || e.target.closest("[data-cancel]")) dialog.close(); });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true; submit.textContent = "Сохраняем…";
    try {
      const result = await saveVisit({
        id: existing?.id, place_id: place.id,
        visit_date: form.elements.visit_date.value,
        impression: form.elements.impression.value,
        rating: form.elements.rating.value,
        photo_file: form.elements.photo.files?.[0] || null,
        photo_url: existing?.photo_url, photo_data: existing?.photo_data, photo_path: existing?.photo_path
      });
      dialog.close();
      document.dispatchEvent(new CustomEvent("katyusha:visits-changed", { detail: { placeId: place.id } }));
      if (!result.synced) window.dispatchEvent(new CustomEvent("katyusha:toast", { detail: "Посещение сохранено на устройстве. Синхронизация ожидает подключения." }));
    } catch (error) {
      submit.disabled = false; submit.textContent = "Повторить";
      alert(error.message || "Не удалось сохранить посещение.");
    }
  });
  dialog.showModal();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function visitHistoryHtml(placeId) {
  const items = getVisits(placeId);
  if (!items.length) return '<div class="muted" style="margin:12px 0">Пока нет отметок о посещении.</div>';
  return `<section style="margin:16px 0"><h4>История посещений (${items.length})</h4>${items.map((v) => `
    <article style="padding:12px 0;border-top:1px solid var(--line)">
      <strong>${escapeHtml(new Date(v.visit_date + "T12:00:00").toLocaleDateString("ru-RU"))}</strong>
      ${v.rating ? `<span class="muted"> · ${"★".repeat(v.rating)}</span>` : ""}
      ${v.impression ? `<p>${escapeHtml(v.impression)}</p>` : ""}
      ${v.photo_url ? `<img src="${escapeHtml(v.photo_url)}" alt="Фото посещения" loading="lazy" style="max-width:100%;max-height:220px;object-fit:cover;border-radius:12px">` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="btn btn--sm" data-visit-edit="${v.id}" data-visit-place="${placeId}">Изменить</button>
        <button class="btn btn--sm" data-visit-delete="${v.id}" data-visit-place="${placeId}">Удалить</button>
        <span class="muted" style="font-size:12px;align-self:center">${v.synced ? "Синхронизировано" : "Сохранено локально"}</span>
      </div>
    </article>`).join("")}</section>`;
}
