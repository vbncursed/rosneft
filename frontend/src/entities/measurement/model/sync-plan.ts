import type { Chain } from "./chain";
import type { MeasurePoint } from "./measurement";
import type { MeasurementAction, MeasurementState } from "./measurement-reducer";

// syncPlan decides which server calls one reducer transition needs; the
// caller runs them. It never decides whether to ask first — `clear` is
// confirmed upstream, in the UI.
//
//   - create: a chain that just stopped being active (M-3), or a part of a
//     cut that came from the active chain or from a saved one;
//   - update: a saved chain whose points or closed flag changed (the first
//     surviving part of a cut keeps its server id);
//   - delete: a saved chain that is gone, or a row whose save landed after
//     its chain was removed and that no chain holds (`chain: null` — nothing
//     to put back);
//   - deleteAll: `clear` without keepSaved over at least one saved chain.
// delete and deleteAll carry what they remove, so a failed call can restore
// it. Every operation needs its own grant; without it the chain stays local.

export interface SyncGrants {
  create: boolean;
  write: boolean;
  delete: boolean;
}

export type SyncOp =
  | { kind: "create"; id: number; points: MeasurePoint[]; closed: boolean }
  | { kind: "update"; id: number; serverId: number; points: MeasurePoint[]; closed: boolean }
  | { kind: "delete"; id: number; serverId: number; chain: SavedChain | null }
  | { kind: "deleteAll"; chains: SavedChain[] };

export type SavedChain = Chain & { serverId: number };

const REQUIRED = { create: "create", update: "write", delete: "delete", deleteAll: "delete" } as const;

// A cut may need all three calls, so its affordance on a saved chain needs all three grants.
export function canEditSaved(grants: SyncGrants): boolean {
  return grants.create && grants.write && grants.delete;
}

/**
 * Whether a chain offers its remove affordances. A chain on its way to the
 * server offers none — a cut there could not reach the row being written
 * (review r-1) — and a chain the server holds needs every edit grant (m-2).
 */
export function canRemove(chain: Chain, editSaved: boolean): boolean {
  return chain.sync !== "saving" && (chain.serverId == null || editSaved);
}

export function syncPlan(
  action: MeasurementAction,
  before: MeasurementState,
  after: MeasurementState,
  grants: SyncGrants,
): SyncOp[] {
  return opsFor(action, before, after).filter((op) => grants[REQUIRED[op.kind]]);
}

function opsFor(
  action: MeasurementAction,
  before: MeasurementState,
  after: MeasurementState,
): SyncOp[] {
  switch (action.type) {
    case "saved":
      // The chain went while its create was in flight: the new row is an orphan
      // — unless a chain still holds it (a later cut kept the row under a new id).
      return after.chains.some((c) => c.id === action.id || c.serverId === action.serverId)
        ? []
        : [{ kind: "delete", id: action.id, serverId: action.serverId, chain: null }];
    case "seed":
    case "saving":
    case "failed":
    case "restore":
      return [];
    case "clear": {
      const saved = before.chains.filter(isSaved);
      return !action.keepSaved && saved.length > 0 ? [{ kind: "deleteAll", chains: saved }] : [];
    }
    default:
      return [...deletes(before, after), ...updates(before, after), ...creates(action, before, after)];
  }
}

function isSaved(chain: Chain): chain is SavedChain {
  return chain.serverId != null;
}

function deletes(before: MeasurementState, after: MeasurementState): SyncOp[] {
  const kept = new Set(after.chains.map((c) => c.serverId));
  return before.chains
    .filter(isSaved)
    .filter((c) => !kept.has(c.serverId))
    .map((c): SyncOp => ({ kind: "delete", id: c.id, serverId: c.serverId, chain: c }));
}

function updates(before: MeasurementState, after: MeasurementState): SyncOp[] {
  const was = new Map(before.chains.filter(isSaved).map((c) => [c.serverId, c]));
  return after.chains
    .filter(isSaved)
    .filter((c) => {
      const old = was.get(c.serverId);
      return old != null && (old.closed !== c.closed || !samePoints(old.points, c.points));
    })
    .map((c): SyncOp => ({ kind: "update", id: c.id, serverId: c.serverId, points: c.points, closed: c.closed }));
}

function creates(
  action: MeasurementAction,
  before: MeasurementState,
  after: MeasurementState,
): SyncOp[] {
  const known = new Set(before.chains.map((c) => c.id));
  const target =
    action.type === "removeSegment" ? before.chains.find((c) => c.id === action.chainId) : undefined;
  // A chain whose save failed is still meant for the server, so its parts are too.
  const cutReachesServer =
    target != null &&
    (target.id === before.activeChainId || isSaved(target) || target.sync === "failed");
  return after.chains
    .filter(
      (c) =>
        !isSaved(c) &&
        c.points.length >= 2 &&
        c.id !== after.activeChainId &&
        (c.id === before.activeChainId || (cutReachesServer && !known.has(c.id))),
    )
    .map((c): SyncOp => ({ kind: "create", id: c.id, points: c.points, closed: c.closed }));
}

function samePoints(a: MeasurePoint[], b: MeasurePoint[]): boolean {
  return (
    a.length === b.length &&
    a.every((pt, i) => pt.x === b[i].x && pt.y === b[i].y && pt.z === b[i].z)
  );
}
