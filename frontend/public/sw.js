// A minimal service worker. It exists for two reasons: Chrome and Edge offer
// no "Install" button without a fetch handler, and with no network it is
// nicer to land on our own screen than on the browser's error page.
//
// ponytail: only the offline page is cached. Models weigh hundreds of
// megabytes and would need an eviction policy — add one if repeat visits are
// ever reported slow.
// v3: the Next → Vite move — the offline screen became the self-contained
// public/offline.html (inline styles, no JS) instead of the server route
// /offline. Renaming the cache makes the worker reinstall and refetch the
// page; otherwise installed copies would keep the old /offline.
// v4: frontend-v2 became frontend — offline.html was redrawn in the design
// system's tokens; the cache is renamed for the same reason as in v3.
const CACHE = "andrey-shell-v4";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // Page navigations only. Everything else goes past the cache to the
  // network, so the /api routes, the job-event SSE stream and GLB downloads
  // behave exactly as they would with no service worker — it can break
  // neither auth nor resumed downloads.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      // The cache may never have been filled — then the browser's own error.
      return cached ?? Response.error();
    }),
  );
});
