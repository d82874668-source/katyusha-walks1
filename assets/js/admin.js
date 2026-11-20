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
show();
