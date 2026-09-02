import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// No routes yet — the design system is browsed through React Cosmos
// (`yarn cosmos`). Pages land here as they are ported.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
          v2 · redesign
        </p>
        <h1 className="m-0 mt-3 text-4xl font-bold tracking-tight">Andrey 3D</h1>
        <p className="m-0 mt-3 text-sm text-muted">
          Component library lives in React Cosmos — <code className="font-mono">yarn cosmos</code>
        </p>
      </div>
    </main>
  </StrictMode>,
);
