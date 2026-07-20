// Экран, который service worker отдаёт без сети. Он обязан выглядеть прилично
// в самых недружелюбных условиях: SW кэширует только этот HTML, а таблица
// стилей и клиентские чанки лежат в _next/static и офлайн не загружаются.
// Поэтому страница несёт свои стили инлайном и не зависит от JS: «Retry» —
// обычная ссылка, а не кнопка с onClick, который без гидратации мёртв.
const CSS = `
/* Сброса Tailwind тут может не быть — снимаем отступ body сами, иначе по
   краям остаётся светлая рамка поверх тёмного экрана. */
body { margin: 0; }
.offline-screen {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem;
  text-align: center;
  background: #ffffff;
  color: #171717;
  /* Запасное значение внутри var(): переменную объявляет файл next/font,
     и без него правило целиком стало бы недействительным — текст уезжал
     в засечный шрифт по умолчанию. */
  font-family: var(--font-plex-sans, system-ui), system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  .offline-screen { background: #0a0a0a; color: #ededed; }
}
.offline-screen h1 { margin: 0; font-size: 1.25rem; font-weight: 500; }
.offline-screen p { margin: 0; max-width: 24rem; font-size: 0.875rem; opacity: 0.7; }
.offline-retry {
  border: 1px solid currentColor;
  border-radius: 0.25rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  color: inherit;
  text-decoration: none;
}
`;

export default function OfflinePage() {
  return (
    <>
      <style>{CSS}</style>
      <main className="offline-screen">
        <h1>No connection</h1>
        <p>
          This app needs a connection — territories and models load from the server.
          Check your network and try again.
        </p>
        {/* Именно <a>, а не <Link>: нужен полноценный запрос документа, чтобы
            service worker заново сходил в сеть. Клиентский переход роутером
            этого не сделает, да и роутера здесь нет — JS не загрузился. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="offline-retry" href="/">
          Retry
        </a>
      </main>
    </>
  );
}
