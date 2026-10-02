type ViewerOptions = { set: (name: string, value: unknown) => void };

/**
 * viewer.mjs announces `webviewerloaded` on its parent document before it starts; the event carries the iframe's
 * window, whose `PDFViewerApplicationOptions` is the live option store. Scripting is off by decision, and
 * `disablePreferences` stops anything stored in the viewer's localStorage from switching it back on.
 */
export function lockPdfViewer(event: Event): void {
  const options = (event as CustomEvent<{ source?: { PDFViewerApplicationOptions?: ViewerOptions } }>).detail?.source
    ?.PDFViewerApplicationOptions;
  options?.set("enableScripting", false);
  options?.set("disablePreferences", true);
}

/** For a layout effect: registered before the iframe can have fetched viewer.mjs. */
export function lockPdfViewerOnLoad(): () => void {
  document.addEventListener("webviewerloaded", lockPdfViewer);
  return () => document.removeEventListener("webviewerloaded", lockPdfViewer);
}
