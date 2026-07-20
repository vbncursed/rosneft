export type Point = { t: number; v: number };

/**
 * Одна временная серия: подпись (обычно имя сервиса или статус) и точки.
 * `labels` — исходный набор меток из Prometheus. Графикам он не нужен, но
 * карточке алертов без него не отличить `pending` от `firing`.
 */
export type Series = { label: string; points: Point[]; labels?: Record<string, string> };

/** Строка для чарта: общая ось времени, по колонке на серию. */
export type Row = { t: number } & Record<string, number>;

/**
 * Схлопывает серии в общую ось времени. Пропуски остаются пропусками —
 * Recharts рисует разрыв там, где у серии нет ключа, а не проваливается в ноль.
 */
export function toRows(series: Series[]): Row[] {
  const byTime = new Map<number, Row>();
  for (const s of series) {
    for (const p of s.points) {
      const row = byTime.get(p.t) ?? ({ t: p.t } as Row);
      row[s.label] = p.v;
      byTime.set(p.t, row);
    }
  }
  return [...byTime.values()].sort((x, y) => x.t - y.t);
}

export type Unit = "rps" | "cpm" | "percent" | "seconds" | "bytes" | "mbps" | "count";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

export function formatValue(v: number, unit: Unit): string {
  if (!Number.isFinite(v)) return "—";
  switch (unit) {
    case "rps":
      return `${round(v)}/s`;
    case "cpm":
      return `${round(v)}/min`;
    case "percent":
      return `${(v * 100).toFixed(1)}%`;
    case "seconds":
      return v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`;
    case "bytes":
      return v >= GB ? `${(v / GB).toFixed(1)} GB` : `${(v / MB).toFixed(1)} MB`;
    case "mbps":
      return `${v.toFixed(1)} MB/s`;
    case "count":
      return String(round(v));
  }
}

function round(v: number): number {
  return v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
}
