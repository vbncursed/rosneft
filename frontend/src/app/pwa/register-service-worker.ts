/**
 * Registers public/sw.js after load. Silent on failure — plain HTTP, a private
 * window, an old browser: the app runs fine as a plain site, only install and
 * the offline page are lost. Never inside the desktop shell: its main process
 * owns offline, and a second cache layer in front of it would only disagree.
 */
export function registerServiceWorker(nav: Navigator = navigator, win: Window = window): void {
  if (!("serviceWorker" in nav) || win.desktop) return;
  win.addEventListener("load", () => {
    nav.serviceWorker.register("/sw.js").catch(() => {});
  });
}
