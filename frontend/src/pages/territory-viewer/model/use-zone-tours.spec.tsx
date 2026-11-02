import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const markTourSeen = vi.fn();
vi.mock("@/features/onboarding/api/tours-gateway", () => ({
  markTourSeen: (id: string) => markTourSeen(id),
}));

// useTour remembers finished tours at module level, so each test gets a fresh copy.
async function setup(seen: string[] | undefined, blocked = false) {
  vi.resetModules();
  const { useZoneTours } = await import("./use-zone-tours");
  let props = { seen, blocked };
  const hook = renderHook(() => {
    const t = useZoneTours(props);
    return t;
  });
  return {
    ...hook,
    want: (plan: boolean, card: boolean) =>
      act(() => {
        hook.result.current.want(plan, card);
      }),
    rerender: (next: Partial<typeof props>) => {
      props = { ...props, ...next };
      act(() => hook.rerender());
    },
  };
}

beforeEach(() => markTourSeen.mockReset().mockResolvedValue(undefined));

describe("useZoneTours", () => {
  it("stays idle until the page says the editor is on screen", async () => {
    const t = await setup([]);
    expect(t.result.current.plan.active).toBe(false);
    t.want(true, false);
    expect(t.result.current.plan.active).toBe(true);
    expect(t.result.current.plan.step?.id).toBe("document-align");
    expect(t.result.current.card.active).toBe(false);
  });

  it("starts the card tour on the first selected zone, independently of the plan tour", async () => {
    const t = await setup(["plan-editor"]);
    t.want(false, true);
    expect(t.result.current.plan.active).toBe(false);
    expect(t.result.current.card.active).toBe(true);
    expect(t.result.current.card.step?.id).toBe("zone-card");
  });

  it("does not start for a reader who has seen it, or before the principal is known", async () => {
    const seen = await setup(["plan-editor", "zone-card"]);
    seen.want(true, true);
    expect(seen.result.current.plan.active || seen.result.current.card.active).toBe(false);
    const unknown = await setup(undefined);
    unknown.want(true, true);
    expect(unknown.result.current.plan.active || unknown.result.current.card.active).toBe(false);
  });

  it("waits while another tour is on screen, then starts", async () => {
    const t = await setup([], true);
    t.want(true, false);
    expect(t.result.current.plan.active).toBe(false);
    t.rerender({ blocked: false });
    expect(t.result.current.plan.active).toBe(true);
  });

  it("holds the card tour while the editor is open and starts it once the editor closes", async () => {
    const t = await setup([]);
    t.want(true, true);
    expect(t.result.current.plan.active).toBe(true);
    expect(t.result.current.card.active).toBe(false);
    act(() => t.result.current.plan.skip());
    t.want(false, true);
    expect(t.result.current.card.active).toBe(true);
  });

  it("POSTs the plan tour's own id once when it ends", async () => {
    const t = await setup([]);
    t.want(true, false);
    act(() => t.result.current.plan.skip());
    expect(markTourSeen).toHaveBeenCalledTimes(1);
    expect(markTourSeen).toHaveBeenCalledWith("plan-editor");
  });

  it("replays on demand", async () => {
    const t = await setup(["zone-card"]);
    t.want(false, true);
    expect(t.result.current.card.active).toBe(false);
    act(() => t.result.current.card.restart());
    expect(t.result.current.card.step?.id).toBe("zone-card");
  });

  it("reports any tour on screen, the blocking ones included, and the running step's tab", async () => {
    const t = await setup([], true);
    expect(t.result.current.anyActive).toBe(true);
    expect(t.result.current.tab).toBeUndefined();
    t.rerender({ blocked: false });
    expect(t.result.current.anyActive).toBe(false);
    t.want(true, false);
    expect(t.result.current.anyActive).toBe(true);
    expect(t.result.current.tab).toBe("view");
  });

  it("aims Replay at the editor, then the card, else the viewer's tour", async () => {
    const t = await setup(["plan-editor", "zone-card"]);
    const viewer = { restart: vi.fn() } as never;
    expect(t.result.current.replayOf(viewer)).toBe(viewer);
    t.want(false, true);
    expect(t.result.current.replayOf(viewer)).toBe(t.result.current.card);
    t.want(true, true);
    expect(t.result.current.replayOf(viewer)).toBe(t.result.current.plan);
  });
});
