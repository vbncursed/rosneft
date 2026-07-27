import { createRoute, redirect } from "@tanstack/react-router";
import { adminLayoutRoute } from "@/routes/admin";
import { requireAuth } from "@/routes/guard";
import { meQuery } from "@/auth/application/me-query";
import { STAT_IDS, SECTIONS, view } from "@/metrics/domain/panel-catalog";
import MetricsDashboard from "@/metrics/presentation/components/metrics-dashboard";

function AdminMetrics() {
  return (
    <MetricsDashboard
      stats={STAT_IDS.map(view)}
      sections={SECTIONS.map((s) => ({ title: s.title, panels: s.panelIds.map(view) }))}
    />
  );
}

// Owner-only, mirrors the RSC page. Panel series load per-tile via usePanelSeries
// against the gateway's owner-gated /api/metrics/query.
export const adminMetricsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "metrics",
  beforeLoad: async ({ context, location }) => {
    requireAuth(location.pathname);
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me.isOwner) throw redirect({ to: "/admin/users" });
  },
  component: AdminMetrics,
});
