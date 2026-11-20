const VERSION = "katyusha-pwa-v4";
const STATIC_CACHE = VERSION + "-static";
const DATA_CACHE = VERSION + "-data";
const IMAGE_CACHE = VERSION + "-images";
const ROOT = new URL("./", self.location.href);
const PRECACHE = [
  "./",
  "./index.html",
  "./404.html",
  "./manifest.webmanifest",
  "./assets/css/styles.css",
  "./assets/favicon.svg",
  "./assets/icons/pwa-icon.svg",
  "./assets/js/app.js",
  "./assets/js/config.js",
  "./assets/js/data.js",
  "./assets/js/ideal.js",
  "./assets/js/map.js",
  "./assets/js/planner.js",
  "./assets/js/pwa.js",
  "./assets/js/state.js",
  "./assets/js/store.js",
  "./assets/js/taxonomy.js",
  "./assets/js/ui.js",
  "./assets/js/visits.js"
].map((path) => new URL(path, ROOT).href);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("katyusha-pwa-") && ![STATIC_CACHE, DATA_CACHE, IMAGE_CACHE].includes(key))
      .map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === "opaque")) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("offline");
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) cache.put(request, response.clone()).catch(() => {});
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === "navigate") {
      event.respondWith(networkFirst(request, STATIC_CACHE).catch(async () =>
        (await caches.match(new URL("./index.html", ROOT).href)) ||
        new Response("Вы офлайн. Откройте ранее загруженную страницу каталога.", {
          headers: { "Content-Type": "text/plain; charset=utf-8" }, status: 503
        })
      ));
      return;
    }
    if (/\.(?:css|js|svg|webmanifest|woff2?)$/i.test(url.pathname) || /\/assets\/images\//.test(url.pathname)) {
      event.respondWith(cacheFirst(request, STATIC_CACHE).catch(() => caches.match(request)));
      return;
    }
  }

  // Только публичный каталог и маршруты: пользовательские данные/избранное не кэшируем.
  if (/\.supabase\.co$/.test(url.hostname) && /\/rest\/v1\/(places|routes|place_photos)(?:\?|$)/.test(url.pathname + url.search)) {
    event.respondWith(networkFirst(request, DATA_CACHE).catch(() => caches.match(request)));
    return;
  }

  // Кэшируем используемые CDN-скрипты и стили (в частности Leaflet), чтобы оболочка открывалась офлайн.
  if (url.origin !== self.location.origin && ["script", "style", "font"].includes(request.destination)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE).catch(() => caches.match(request)));
    return;
  }

  // Фотографии карточек могут приходить с внешних публичных фотохостингов.
  if (request.destination === "image" && url.protocol.startsWith("http")) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE).catch(() => caches.match(request)));
  }
});
