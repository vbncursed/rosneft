// Served only before the first shell generation exists — a first launch with no
// network. Self-contained: there is nothing else on disk to load.
const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Andrey — offline</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: Canvas; color: CanvasText; }
  main { max-width: 28rem; padding: 2rem; text-align: center; }
  button { margin-top: 1.5rem; padding: .6rem 1.2rem; font: inherit; cursor: pointer; }
</style></head>
<body><main>
  <h1>You're offline</h1>
  <p>Andrey needs a connection the first time it starts. Once you have opened it online, territories you saved stay available without a network.</p>
  <button type="button" onclick="location.reload()">Try again</button>
</main></body></html>`;

export const offlineResponse = (): Response =>
  new Response(PAGE, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
