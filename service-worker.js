const CACHE = "capi-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app-fixed.js?v=5",
  "./stats-enhanced.js?v=5",
  "./stats-theme.js?v=6",
  "./stats-core-v6.js?v=6",
  "./db.js",
  "./manifest.webmanifest",
  "./assets/background.webp",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).then(response => {
      if (response && response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => caches.match(event.request))
  );
});
