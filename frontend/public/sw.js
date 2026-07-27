// Минимальный service worker: существует ради двух вещей — Chrome и Edge не
// показывают кнопку «Установить» без fetch-хандлера, и без сети приятнее
// увидеть свой экран, чем страницу ошибки браузера.
//
// ponytail: кэшируется только /offline. Модели весят сотни мегабайт и
// требуют политики вытеснения — добавить, если появится жалоба на скорость
// повторных заходов.
// v3: SPA-переход с Next на Vite — офлайн-экран теперь самодостаточный
// public/offline.html (свои инлайновые стили, ноль JS), а не серверный роут
// /offline. Смена имени кэша заставляет worker переустановиться и перезабрать
// страницу — иначе у установленных копий остался бы старый /offline.
const CACHE = "andrey-shell-v3";
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
  // Только переходы по страницам. Всё остальное идёт мимо кэша в сеть, поэтому
  // BFF-роуты /api/*, SSE-поток job-событий и отдача GLB работают ровно так же,
  // как без service worker — он не может сломать ни авторизацию, ни докачку.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      // Кэш мог не наполниться — тогда отдаём штатную ошибку браузера.
      return cached ?? Response.error();
    }),
  );
});
