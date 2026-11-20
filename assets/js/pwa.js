const rootUrl = new URL("../../", import.meta.url);

export function initPWA() {
  const style = "position:fixed;z-index:10000;right:16px;bottom:16px;border:1px solid rgba(15,21,34,.16);border-radius:999px;padding:10px 15px;background:#D8365C;color:#fff;font:600 13px/1.2 inherit;box-shadow:0 8px 24px rgba(15,21,34,.18);cursor:pointer";
  const install = document.createElement("button");
  install.type = "button";
  install.textContent = "Установить приложение";
  install.style.cssText = style + ";display:none";
  install.setAttribute("aria-label", "Установить Прогулки с Катюшей на устройство");

  const offline = document.createElement("div");
  offline.setAttribute("role", "status");
  offline.setAttribute("aria-live", "polite");
  offline.textContent = "Нет интернета — показываем сохранённые данные";
  offline.style.cssText = "position:fixed;z-index:10000;left:50%;bottom:16px;transform:translateX(-50%);padding:9px 14px;border-radius:12px;background:#252B36;color:#fff;font:500 13px/1.4 inherit;box-shadow:0 8px 24px rgba(15,21,34,.18);display:none;max-width:calc(100vw - 32px);text-align:center";
  document.body.append(install, offline);

  let promptEvent = null;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  if (!standalone && isIOS) install.style.display = "block";
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    promptEvent = event;
    if (!standalone) install.style.display = "block";
  });
  window.addEventListener("appinstalled", () => {
    install.style.display = "none";
    promptEvent = null;
  });
  install.addEventListener("click", async () => {
    if (isIOS && !promptEvent) {
      alert('Чтобы установить сайт на iPhone: нажмите «Поделиться» в Safari → «На экран Домой» → «Добавить».');
      return;
    }
    if (!promptEvent) {
      alert("Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».");
      return;
    }
    promptEvent.prompt();
    await promptEvent.userChoice.catch(() => null);
    promptEvent = null;
    install.style.display = "none";
  });

  const updateNetwork = () => { offline.style.display = navigator.onLine ? "none" : "block"; };
  window.addEventListener("online", updateNetwork);
  window.addEventListener("offline", updateNetwork);
  updateNetwork();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register(new URL("sw.js", rootUrl), { scope: rootUrl.pathname })
      .catch((error) => console.warn("PWA: не удалось зарегистрировать Service Worker", error));
  }
}
