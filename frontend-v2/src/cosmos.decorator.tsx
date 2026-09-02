import type { ReactNode } from "react";
import "./index.css";

/** Every fixture renders on the app's real tokens and fonts. */
export default function CosmosDecorator({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-bg p-6 text-fg">{children}</div>;
}
