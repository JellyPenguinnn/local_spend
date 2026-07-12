/* global self, caches, fetch, URL, Response */

const CACHE_PREFIX = "localspend-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v17`;
const APP_SCOPE = new URL(self.registration.scope);
const APP_SHELL = ["./", "manifest.webmanifest", "localspend-icon.svg"].map((path) => new URL(path, APP_SCOPE).toString());

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== APP_SCOPE.origin || !requestUrl.pathname.startsWith(APP_SCOPE.pathname)) return;
  const isHashedAsset = requestUrl.pathname.startsWith(new URL("assets/", APP_SCOPE).pathname);
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      if (isHashedAsset) {
        const cachedAsset = await cache.match(event.request);
        if (cachedAsset) return cachedAsset;
      }
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          return (await cache.match(new URL("./", APP_SCOPE).toString())) || Response.error();
        }
        return Response.error();
      }
    })()
  );
});
