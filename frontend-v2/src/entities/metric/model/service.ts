/** How a scraped service is doing. */
export type ServiceState = "up" | "degraded" | "down";

export type ServiceHealth = {
  name: string;
  state: ServiceState;
  /** The mono line under the name. */
  meta: string;
  /** Recent throughput, newest last. */
  samples: number[];
  /** e.g. "18ms", or "—" when nothing is being scraped. */
  latency: string;
  /** e.g. "1.2/s", or "—". */
  errors: string;
};

export const SERVICE_TONE = { up: "ok", degraded: "warn", down: "bad" } as const;

/** A service that is not answering has no numbers worth reading. */
export const isScraped = (service: ServiceHealth) => service.state !== "down";

/** "5 services · 1 down", or just the count when everything is answering. */
export function healthSummary(services: ServiceHealth[]): string {
  const total = `${services.length} ${services.length === 1 ? "service" : "services"}`;
  const down = services.filter((s) => s.state === "down").length;
  return down === 0 ? total : `${total} · ${down} down`;
}
