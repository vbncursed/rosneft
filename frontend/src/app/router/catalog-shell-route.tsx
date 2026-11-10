import { useQuery } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { meQuery } from "@/entities/user";
import { useOfflineUser } from "@/features/offline-save";
import { CatalogShell } from "@/widgets/catalog-shell";
import { OfflineBanner } from "@/widgets/offline-banner";
import { Toaster } from "@/widgets/toaster";
import { isTerritoryPage } from "./guard";
import { navigateClick } from "./navigate-click";

/**
 * The chrome around the four catalog routes (/territories, /territories/new,
 * /models, /models/new). Mirrors ConsoleShell's click delegate — a link into
 * the catalog from a console screen (and vice versa) stays inside the SPA
 * rather than reloading — but there is no sidebar, so nothing here reads the
 * principal beyond the same stale-cache-edge guard: catalogRoute's loader
 * already awaited it.
 *
 * The layout is read off the pathname rather than the matched route: the leaf
 * that wants `viewport` lives in catalog-routes, which imports this file, so
 * `useMatch({ from: territoryRoute.id })` would close the cycle.
 */
export function CatalogShellRoute() {
  const { data: me } = useQuery(meQuery);
  useOfflineUser(me?.id);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  if (!me) return null;

  const viewer = isTerritoryPage(pathname);
  return (
    // role="presentation": the wrapper exists for the click delegate only and
    // adds nothing to the accessibility tree.
    <div role="presentation" onClickCapture={(event) => navigateClick(event, (href) => void navigate({ href }))}>
      <OfflineBanner />
      <CatalogShell layout={viewer ? "viewport" : "page"}>
        <Outlet />
      </CatalogShell>
      {/* The viewer's top-right corner is the Overlays panel's head. */}
      <Toaster placement={viewer ? "bottom-center" : "top-right"} />
    </div>
  );
}
