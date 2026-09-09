import { isLive, type TargetJob, type TitleOf } from "@/entities/conversion";
import type { Model } from "@/entities/model";
import type { Territory, TerritoryCardModel } from "@/entities/territory";
import type { ConsoleNavItem } from "@/widgets/console-nav";

// Four and five fill one row at 1280 with the mock's grid columns.
export const TERRITORY_CARDS = 4;
export const MODEL_CARDS = 5;
export const ACTIVITY_ROWS = 4;

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The n most recently updated; entries without a usable date last, slug within
 * a tie. Compared as instants, never as strings: Go writes RFC3339Nano with
 * the trailing zeros trimmed, so `…00Z` and `…00.5Z` are half a second apart
 * and sort backwards under `localeCompare`.
 */
const instant = (at?: string): number => {
  const ms = at === undefined ? Number.NaN : Date.parse(at);
  return Number.isNaN(ms) ? -Infinity : ms;
};

export function recent<T extends { slug: string; updatedAt?: string }>(items: T[], n: number): T[] {
  return [...items]
    .sort((a, b) => instant(b.updatedAt) - instant(a.updatedAt) || a.slug.localeCompare(b.slug))
    .slice(0, n);
}

/** The mock's viewer-empty state: nothing assigned and no way to add anything. */
export const viewerEmpty = (total: number, canUploadTerritory: boolean, canUploadModel: boolean): boolean =>
  total === 0 && !canUploadTerritory && !canUploadModel;

export function headerMeta(territories: number, models: number, jobs: TargetJob[], empty: boolean): string {
  if (empty) return "0 territories assigned · read-only access";
  const converting = jobs.filter(isLive).length;
  const failed = jobs.filter((j) => j.status === "failed").length;
  const flight = [converting > 0 ? `${converting} converting` : "", failed > 0 ? `${failed} failed` : ""].filter(Boolean);
  return [plural(territories, "territory", "territories"), plural(models, "model", "models"), ...(flight.length ? flight : ["nothing converting"])].join(" · ");
}

export function territoriesMeta(shown: number, total: number, empty: boolean): string {
  if (empty) return "assigned to you";
  return total === 0 ? "none yet" : `showing ${shown} of ${total}`;
}

export const modelsMeta = (total: number): string => (total === 0 ? "none yet" : `${total} in the library`);

export const seeAll = (kind: "territories" | "models", total: number): string => `See all ${total} ${kind} →`;

/** "updates by itself" only while something polls — with failed jobs alone the promise would be false. */
export function jobsMeta(jobs: TargetJob[]): string {
  const n = plural(jobs.length, "job", "jobs");
  return jobs.some(isLive) ? `${n} · updates by itself` : n;
}

export const titleOf = (territories: Territory[], models: Model[]): TitleOf => (kind, slug) =>
  (kind === "territory" ? territories : models).find((x) => x.slug === slug)?.title;

export const showConsole = (items: ConsoleNavItem[]): boolean => items.some((i) => !i.disabled);

/** The mock's Home card draws no chips and no bar — the state shows through border, badge and trailing. */
export const bareCard = (card: TerritoryCardModel): TerritoryCardModel => ({ ...card, chips: [], progress: undefined });
