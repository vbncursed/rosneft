import { useQuery } from "@tanstack/react-query";
import { Outlet, useNavigate } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import { meQuery } from "@/entities/user";
import { CatalogShell } from "@/widgets/catalog-shell";
import { Toaster } from "@/widgets/toaster";
import { routesInApp } from "./guard";

/**
 * The chrome around the four catalog routes (/territories, /territories/new,
 * /models, /models/new). Mirrors ConsoleShell's click delegate — a link into
 * the catalog from a console screen (and vice versa) stays inside the SPA
 * rather than reloading — but there is no sidebar, so nothing here reads the
 * principal beyond the same stale-cache-edge guard: catalogRoute's loader
 * already awaited it.
 */
export function CatalogShellRoute() {
  const { data: me } = useQuery(meQuery);
  const navigate = useNavigate();
  if (!me) return null;

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const href = (event.target as HTMLElement).closest("a")?.getAttribute("href");
    if (!href || !routesInApp(href, event)) return;
    event.preventDefault();
    void navigate({ href });
  };

  return (
    // role="presentation": the wrapper exists for the click delegate only and
    // adds nothing to the accessibility tree.
    <div role="presentation" onClickCapture={onClickCapture}>
      <CatalogShell>
        <Outlet />
      </CatalogShell>
      <Toaster />
    </div>
  );
}

/** Stands in for the four catalog screens until Tasks 4-7 land. Remove in Task 7. */
export const Soon = () => <p>Soon</p>;
