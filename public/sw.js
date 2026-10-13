// packraft-go service worker (#56, ADR 0023): keeps the app shell (the page,
// its scripts and styles, the manifest and icons) so the app opens offline.
//
// It only ever answers GET requests to this site. Map tiles, BRouter and every
// other service go straight to the network and are never cached: offline map
// tiles are out of scope, and tests intercept those requests themselves.
// Hand-written on purpose (no library); its request filter is unit-tested in
// src/pwa/serviceWorker.test.ts.

const CACHE = "packraft-go-shell-v1";
const PAGE = "/";
// Files kept from the start. Scripts and styles have hashed names, so they're
// cached as the page loads them (see "fetch" and "message").
const SHELL = [PAGE, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
const BUILD_FILES = "/_next/static/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

// The page sends the build files it loaded before this worker took over, so
// the first visit is enough to open the app offline later.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "cache-build-files" || !Array.isArray(data.urls)) return;
  const urls = data.urls.filter((href) => {
    const url = new URL(href, self.location.origin);
    return url.origin === self.location.origin && url.pathname.startsWith(BUILD_FILES);
  });
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(urls)).catch(() => undefined));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") event.respondWith(networkFirst(request, PAGE));
  else if (url.pathname.startsWith(BUILD_FILES)) event.respondWith(cacheFirst(request));
  else if (SHELL.includes(url.pathname) && url.search === "") event.respondWith(networkFirst(request, url.pathname));
});

/** The network's answer, kept under `key`; the kept copy when offline. */
function networkFirst(request, key) {
  return fetch(request)
    .then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(key, copy));
      }
      return response;
    })
    .catch(() => caches.match(key).then((kept) => kept || Response.error()));
}

/** Build files never change (their names are hashed), so a kept copy is always right. */
function cacheFirst(request) {
  return caches.match(request).then(
    (kept) =>
      kept ||
      fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }),
  );
}
