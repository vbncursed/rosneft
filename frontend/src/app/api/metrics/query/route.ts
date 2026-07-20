import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/auth/application/current-user";
import { isRange } from "@/metrics/domain/panel";
import { findPanel } from "@/metrics/domain/panels";
import { fetchPanel } from "@/metrics/infrastructure/prometheus-gateway";

export async function GET(req: NextRequest) {
  // Gate: метрики видит только владелец. Матчер в src/proxy.ts исключает /api,
  // поэтому эта проверка — единственная, ровно как было у прокси Grafana.
  const p = await getCurrentUser();
  if (!p?.isOwner) return new Response("forbidden", { status: 403 });

  const params = req.nextUrl.searchParams;
  const panel = findPanel(params.get("panel") ?? "");
  const range = params.get("range") ?? "";
  // PromQL резолвится из реестра на сервере: клиент присылает только id,
  // так что произвольный запрос к Prometheus через этот роут невозможен.
  if (!panel || !isRange(range)) return new Response("bad request", { status: 400 });

  try {
    return Response.json(await fetchPanel(panel, range), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return new Response("upstream unavailable", { status: 502 });
  }
}
