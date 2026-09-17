/**
 * Registers public/sw.js after load. Silent on failure — plain HTTP, a private
 * window, an old browser, or the desktop shell (which answers /sw.js with 404):
 * the app runs fine as a plain site, only install and the offline page are lost.
 */
export function registerServiceWorker(nav: Navigator = navigator, win: Window = window): void {
  if (!("serviceWorker" in nav)) return;
  win.addEventListener("load", () => {
    nav.serviceWorker.register("/sw.js").catch(() => {});
  });
}
