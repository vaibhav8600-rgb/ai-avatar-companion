// Service worker for the AI Avatar Companion PWA.
//
// Strategy:
//   - Navigations  -> network-first, fall back to the cached app shell so the
//     app opens even when offline.
//   - Static GETs  -> stale-while-revalidate (fast loads, refreshed in the bg).
//   - API routes   -> always network; never cached (they're dynamic + POST).
//
// Bump CACHE_VERSION to invalidate old caches on the next activation.

const CACHE_VERSION = "aac-v4";
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/avatar.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GETs. Let everything else (POST to /api, external
  // calls to Simli/Gemini, etc.) pass straight through to the network.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;

  // Never touch dev / HMR traffic. If this worker is ever left controlling a
  // `next dev` server (e.g. after testing a prod build on the same origin),
  // intercepting these was the source of "ChunkLoadError: Loading chunk failed
  // (timeout)". Pass them straight to the network — no cache, no interception.
  if (
    url.search.includes("v=") ||               // webpack dev cache-busting (?v=…)
    url.pathname.includes("hot-update") ||      // HMR patches
    url.pathname.startsWith("/_next/webpack-hmr") ||
    url.pathname.startsWith("/__nextjs")
  ) {
    return;
  }

  // Immutable, content-hashed build assets → cache-first (fast, and the hash in
  // the URL guarantees the bytes are correct, so a cached copy is never stale).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // App navigations: network-first with an offline fallback to the shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/"))),
    );
    return;
  }

  // Other static assets (icons, avatar, manifest): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
