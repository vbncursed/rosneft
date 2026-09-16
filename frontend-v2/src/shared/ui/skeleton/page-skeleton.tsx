import type { ReactNode } from "react";
import { Skeleton } from "./skeleton";

export type PageSkeletonShape = "console" | "journal" | "catalog" | "form";

export type PageSkeletonProps = {
  /**
   * console: the tile row, the filter bar, a grid of cards (Users, Roles, …).
   * journal: filters, the activity summary, a list (Audit — no tiles).
   * catalog: the filter row and tall cards. form: a card beside its aside.
   */
  shape: PageSkeletonShape;
  /** Names the busy status, e.g. "Loading people". */
  label: string;
};

// PageHeader's height: eyebrow + h1 + action (76px); Replace Source adds a
// description under its larger title (187px at 1280). A narrow screen wraps
// the header taller still — that one is not matched.
const HEADER: Record<PageSkeletonShape, string> = {
  console: "76px",
  journal: "76px",
  catalog: "76px",
  form: "187px",
};

const blocks = (count: number, height: string) =>
  Array.from({ length: count }, (_, i) => <Skeleton key={i} height={height} rounded="md" />);

const BODY: Record<PageSkeletonShape, () => ReactNode> = {
  // The console pages' own tile template: a wider first tile, one column below lg.
  console: () => (
    <>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
        {blocks(4, "126px")}
      </div>
      <Skeleton height="44px" rounded="md" />
      <div className="grid gap-3 md:grid-cols-2">{blocks(6, "96px")}</div>
    </>
  ),
  journal: () => (
    <>
      <Skeleton height="44px" rounded="md" />
      <Skeleton height="115px" rounded="md" />
      {/* The feed takes the journal's left column; the right is the inspector's. */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(420px,1fr)_minmax(280px,360px)]">
        <div className="flex flex-col gap-2">{blocks(6, "72px")}</div>
      </div>
    </>
  ),
  catalog: () => (
    <>
      <Skeleton height="44px" rounded="md" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{blocks(6, "280px")}</div>
    </>
  ),
  form: () => (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(420px,1fr)_minmax(300px,380px)]">
      <Skeleton height="360px" rounded="md" />
      <Skeleton height="240px" rounded="md" />
    </div>
  ),
};

/**
 * The loading placeholder in the shape of the screen that replaces it, so the
 * swap does not jump the whole page. It fades in only after 150ms: an answer
 * faster than that never flashes a placeholder at all.
 */
export function PageSkeleton({ shape, label }: PageSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="flex flex-col gap-4 transition-opacity delay-150 duration-150 starting:opacity-0"
    >
      <div className="flex flex-col justify-end gap-3" style={{ height: HEADER[shape] }}>
        <Skeleton height="10px" width="18%" />
        <Skeleton height="40px" width="30%" />
      </div>
      {BODY[shape]()}
    </div>
  );
}
