import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/application/current-user";
import { findPanel, SECTIONS, STAT_IDS } from "@/metrics/domain/panels";
import MetricsDashboard from "@/metrics/presentation/components/metrics-dashboard";
import type { PanelView } from "@/metrics/presentation/components/panel-card";

// Клиент получает только идентификатор, заголовок и единицу измерения:
// PromQL остаётся на сервере, в реестре панелей.
function view(id: string): PanelView {
  const p = findPanel(id);
  if (!p) throw new Error(`unknown panel: ${id}`);
  return { id: p.id, title: p.title, unit: p.unit };
}

export default async function MetricsPage() {
  const p = await getCurrentUser();
  if (!p?.isOwner) redirect("/");

  return (
    <MetricsDashboard
      stats={STAT_IDS.map(view)}
      sections={SECTIONS.map((s) => ({ title: s.title, panels: s.panelIds.map(view) }))}
    />
  );
}
