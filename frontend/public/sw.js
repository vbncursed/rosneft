// Минимальный service worker: существует ради двух вещей — Chrome и Edge не
// показывают кнопку «Установить» без fetch-хандлера, и без сети приятнее
// увидеть свой экран, чем страницу ошибки браузера.
//
// ponytail: кэшируется только /offline. Модели весят сотни мегабайт и
// требуют политики вытеснения — добавить, если появится жалоба на скорость
// повторных заходов.
// v2: под v1 в кэше лежит офлайн-страница, которая рендерилась прозрачной
// (motion выставлял opacity: 0 до гидратации, а офлайн JS не приезжает).
// Смена имени заставляет worker переустановиться и перезабрать страницу —
// иначе у уже установленных копий остался бы пустой экран.
const CACHE = "andrey-shell-v2";
const OFFLINE_URL = "/offline";

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
