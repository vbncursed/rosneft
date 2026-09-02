import type { ReactNode } from "react";
import "./index.css";

/**
 * Every fixture renders on the app's real tokens and fonts.
 *
 * No padding here: a full-screen fixture (a page, the console shell) has to
 * reach the edges, and a decorator's padding cannot be opted out of — Cosmos
 * composes decorators, it does not let a nested one replace its parent. So
 * component fixtures carry their own gutter instead.
 */
export default function CosmosDecorator({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-bg text-fg">{children}</div>;
}
