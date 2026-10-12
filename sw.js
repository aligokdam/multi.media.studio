/* Offline cache for the app's own files (same origin only; nothing else is
   requested). Stale-while-revalidate: the cached copy answers instantly and
   is refreshed in the background, so updates arrive on the next visit. */
const VERSION = "mms-2.0.7";
const CORE = [
  "./", "./index.html", "./app.webmanifest", "./assets/icons/icon.svg",
  "./assets/css/base.css", "./assets/css/landing.css", "./assets/css/studio.css", "./assets/css/photo-editor.css",
  "./src/boot.js", "./src/main.js", "./locales/index.js", "./locales/en.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(network); return cached; }
    const res = await network;
    return res || (req.mode === "navigate" ? cache.match("./index.html") : Response.error());
  }));
});
