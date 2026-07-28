import type { Unit } from "./series.ts";

export const RANGES = ["1h", "6h", "24h", "7d"] as const;
export type Range = (typeof RANGES)[number];

export function isRange(v: string): v is Range {
  return (RANGES as readonly string[]).includes(v);
}

export type PanelKind = "line" | "stat" | "alerts";

/**
 * Определение панели. `expr` живёт только на сервере: клиент присылает id,
 * роут резолвит его сюда. Так в браузерный бандл не попадает PromQL и не
 * появляется возможность выполнить произвольный запрос к Prometheus.
 */
export type PanelDef = {
  id: string;
  title: string;
  unit: Unit;
  kind: PanelKind;
  expr: string;
  instant?: boolean;
};

// PanelView is the client-safe projection the dashboard renders: id + title +
// unit, without the server-only `expr`. panel-catalog.view() builds it.
export type PanelView = Pick<PanelDef, "id" | "title" | "unit">;
