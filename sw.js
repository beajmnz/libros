// Keeps the app working inside the library when there is no signal.
// Bump VERSION whenever you change index.html, styles.css, app.js or data/books.json.
const VERSION = "v3";
const CACHE = `libros-${VERSION}`;
const CORE = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "data/books.json",
  "manifest.webmanifest",
  "icon.svg",
  "icon-192.png",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("libros-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!sameOrigin && !isFont) return;

  // Covers and fonts rarely change: serve from cache, fetch once.
  if (isFont || url.pathname.includes("/covers/")) {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === "opaque") cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Everything else: try the network first so updates arrive, fall back to the cache offline.
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) caches.open(CACHE).then(cache => cache.put(req, res.clone()));
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match("index.html")))
  );
});
