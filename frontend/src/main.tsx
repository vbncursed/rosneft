import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { queryClient } from "@/shared/infrastructure/query/query-client";
import { router } from "@/routes/router";
import "@/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

// Register the PWA service worker (public/sw.js) after load. Silent on failure
// (no HTTPS / private mode / old browser) — the app runs fine as a plain site,
// only install + offline fallback are unavailable.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
