import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div style={{ color: "white", padding: 24 }}>SPA scaffold OK</div>
  </StrictMode>,
);
