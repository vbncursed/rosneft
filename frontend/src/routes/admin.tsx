import { createRoute, redirect, Outlet } from "@tanstack/react-router";
import { authedLayoutRoute } from "@/routes/layout";
import { requireAuth, consoleLanding } from "@/routes/guard";
import { meQuery } from "@/auth/application/me-query";
import { can } from "@/auth/domain/principal";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import ConsoleSidebar from "@/auth/presentation/console/console-sidebar";

function ConsoleShell() {
  const me = useCurrentUser();
  const showContent = can(me, "territory:write") || can(me, "model:write");
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] text-white">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-6 py-12 sm:px-10 md:grid-cols-[200px_1fr]">
          <ConsoleSidebar
          showContent={showContent}
          showAccess={!!me?.isOwner}
          showMetrics={!!me?.isOwner}
          showAudit={can(me, "audit:read")}
        />
        <section className="min-w-0">
          <Outlet />
        </section>
      </div>
    </main>
  );
}

// Console gate mirrors the Next layout: any of users:read / roles:read. This is
// the only OR-permission route, so the check is inlined rather than adding a
// requireAnyPermission guard for one caller.
export const adminLayoutRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/admin",
  beforeLoad: async ({ context, location }) => {
    requireAuth(location);
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!(can(me, "users:read") || can(me, "roles:read"))) throw redirect({ to: "/" });
  },
  component: ConsoleShell,
});

export const adminIndexRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/",
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    throw redirect({ to: consoleLanding(me) });
  },
});
