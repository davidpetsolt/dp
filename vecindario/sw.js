/* Vecindario service worker.
   Caches the app shell so Repaso and Huecos work with no signal.
   API calls are never cached: conversation always needs the network. */

const CACHE = "vecindario-v4";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // Never intercept the API or anything cross-origin (fonts included: let the
  // browser's own HTTP cache handle those).
  if (e.request.method !== "GET") return;
  if (url.pathname.includes("/v1/messages")) return;
  if (url.origin !== self.location.origin) return;

  // Network first, fall back to cache when offline.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
