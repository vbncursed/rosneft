import { useCallback, useEffect, useRef } from "react";
import {
  createMeasurement,
  deleteMeasurement,
  deleteMeasurements,
  syncPlan,
  updateMeasurement,
  type StoredChain,
  type SyncGrants,
  type SyncOp,
} from "@/entities/measurement";
import { HttpError, messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import {
  useMeasurementTool,
  type MeasurementIO,
  type MeasurementTransition,
} from "./use-measurement-tool";

type Args = {
  slug: string;
  /** The bundle's saved chains; null until the bundle is in hand. */
  stored: StoredChain[] | null;
  grants: SyncGrants;
  /** Called after every call that lands, so the page's bundle cache learns it. */
  onChanged: () => void;
};

type Ctx = MeasurementIO & { slug: string; onChanged: () => void };

const retry = (run: () => void) => ({ label: "Retry", run });

/** A row that is already gone is what a delete asked for. */
const gone = (e: unknown) => e instanceof HttpError && e.status === 404;

/** A save is repeated only for the chain it failed on, untouched since. */
const stillFailed = (ctx: Ctx, id: number) =>
  ctx.read().chains.find((c) => c.id === id)?.sync === "failed";

async function save(ctx: Ctx, op: Extract<SyncOp, { kind: "create" | "update" }>): Promise<void> {
  const { slug, dispatch } = ctx;
  dispatch({ type: "saving", id: op.id });
  const body = { points: op.points, closed: op.closed };
  try {
    const row =
      op.kind === "create"
        ? await createMeasurement(slug, body)
        : await updateMeasurement(slug, op.serverId, body);
    dispatch({ type: "saved", id: op.id, serverId: row.serverId });
    ctx.onChanged();
  } catch (e) {
    dispatch({ type: "failed", id: op.id });
    notify.error(
      `Measurement not saved: ${messageOf(e)}`,
      // A chain cut or removed since holds a newer edit; the old one must not land.
      retry(() => stillFailed(ctx, op.id) && void save(ctx, op)),
    );
  }
}

async function remove(ctx: Ctx, op: Extract<SyncOp, { kind: "delete" }>): Promise<void> {
  try {
    await deleteMeasurement(ctx.slug, op.serverId);
  } catch (e) {
    if (!gone(e)) {
      refused(ctx, op, e);
      return;
    }
  }
  ctx.onChanged();
}

function refused(ctx: Ctx, op: Extract<SyncOp, { kind: "delete" }>, e: unknown): void {
  const chain = op.chain;
  // An orphan was never on screen: nothing to put back, nothing to tell.
  if (!chain) {
    console.warn(`measurement ${op.serverId} left on the server:`, e);
    return;
  }
  ctx.dispatch({ type: "restore", chain });
  notify.error(
    `Measurement not deleted: ${messageOf(e)}`,
    // Asked again on the chain it put back, so screen and server stay one story.
    retry(() => ctx.dispatch({ type: "removeChain", chainId: chain.id })),
  );
}

async function clearAll(ctx: Ctx, op: Extract<SyncOp, { kind: "deleteAll" }>): Promise<void> {
  try {
    await deleteMeasurements(ctx.slug);
    ctx.onChanged();
  } catch (e) {
    for (const chain of op.chains) ctx.dispatch({ type: "restore", chain });
    // No Retry: a repeat must ask again, and Clear is on screen to do it.
    notify.error(`Measurements not cleared: ${messageOf(e)}`);
  }
}

/**
 * Runs one operation of `syncPlan` and reports the outcome through the tool.
 * A failure raises one toast; see each runner for what its Retry repeats.
 */
function send(ctx: Ctx, op: SyncOp): Promise<void> {
  if (op.kind === "delete") return remove(ctx, op);
  if (op.kind === "deleteAll") return clearAll(ctx, op);
  return save(ctx, op);
}

/**
 * The measure tool, with every transition that the server should hear about
 * sent to it (spec M-3, D-2, D-4). The plan is computed in the tool's own
 * dispatcher — never in the reducer, whose StrictMode double run would send
 * every request twice.
 *
 * The saved chains are seeded once per territory, from the bundle; `onChanged`
 * has the page mark that bundle stale, and the next visit re-reads it rather
 * than seed from one that predates what this hook sent.
 *
 * **One territory per hook.** The screen keys the body on the slug, so a new
 * territory is a new hook; the "not while saving" guard below only matters if
 * that ever stops being true — and then the old territory's local and failed
 * chains would stay on the new one, so do not rely on it.
 */
export function useMeasurementSync({ slug, stored, grants, onChanged }: Args) {
  const latest = useRef({ grants, onChanged });
  useEffect(() => {
    latest.current = { grants, onChanged };
  });

  const onTransition = useCallback<MeasurementTransition>(
    (action, before, after, io) => {
      const ctx: Ctx = { ...io, slug, onChanged: () => latest.current.onChanged() };
      for (const op of syncPlan(action, before, after, latest.current.grants)) void send(ctx, op);
    },
    [slug],
  );
  const tool = useMeasurementTool(onTransition);

  const seededFor = useRef<string | null>(null);
  const saving = tool.chains.some((c) => c.sync === "saving");
  const { seed } = tool;
  useEffect(() => {
    if (stored === null || saving || seededFor.current === slug) return;
    seededFor.current = slug;
    seed(stored);
  }, [slug, stored, saving, seed]);

  return tool;
}
