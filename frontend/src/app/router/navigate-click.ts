import type { MouseEvent } from "react";
import { routesInApp } from "./guard";

export function navigateClick(event: MouseEvent<HTMLDivElement>, navigate: (href: string) => void) {
  const href = (event.target as HTMLElement).closest("a")?.getAttribute("href");
  if (!href || !routesInApp(href, event)) return;
  event.preventDefault();
  navigate(href);
}
