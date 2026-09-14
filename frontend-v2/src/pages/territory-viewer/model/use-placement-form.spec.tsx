import { act, renderHook } from "@testing-library/react";
import { useCallback, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { idle, mutating, type MutationState, type ResolvedPlacement } from "@/entities/placement";
import { usePlacementForm, type FormEditor } from "./use-placement-form";

const TANK: ResolvedPlacement = {
  id: 4,
  territorySlug: "refinery-block-c",
  modelSlug: "storage-tank-500",
  label: "",
  updatedAt: "2026-09-09T14:00:00Z",
  visiblePanoramaIds: [],
  position: { x: 18.2, y: 0, z: -4.05 },
  rotation: { x: 0, y: 0.7853981634, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  chain: [],
};
const VALVE: ResolvedPlacement = { ...TANK, id: 7, modelSlug: "valve", label: "West valve" };
const MOVED = { x: 0.749, y: 0, z: 0 };

const select = vi.fn();
let mutation: MutationState;
let list: ResolvedPlacement[];
const update = vi.fn<FormEditor["update"]>();
const rename = vi.fn<FormEditor["rename"]>();
const remove = vi.fn<FormEditor["remove"]>();

const editor = (): FormEditor => ({ placements: list, mutation, update, rename, remove });

/**
 * The selection is the page's, not the hook's, so the harness owns it and the
 * hook's own `select` calls move it — which is what the viewer does. Selecting
 * inside the same commit as `openNew` is the whole point: a "new" draft whose
 * id the page has not selected yet would be dropped on the next render.
 */
const mount = (initial: number | null = null) =>
  renderHook(() => {
    const [id, setId] = useState<number | null>(initial);
    const selectTo = useCallback((next: number | null) => {
      select(next);
      setId(next);
    }, []);
    return { ...usePlacementForm(editor(), selectTo, id), selectTo };
  });

describe("usePlacementForm", () => {
  beforeEach(() => {
    mutation = idle;
    list = [TANK, VALVE];
    select.mockReset();
    for (const fn of [update, rename, remove]) fn.mockReset().mockResolvedValue(undefined);
  });

  it("draws no form when nothing is selected", () => {
    expect(mount().result.current.form).toBeNull();
  });

  it("draws an editable form for whatever is selected, with no form having been opened", () => {
    const { result } = mount(7);
    expect(result.current.form).toMatchObject({
      kind: "edit",
      label: "West valve",
      transform: { position: TANK.position },
    });
  });

  it("re-seeds the form on the object the reader selects next", () => {
    const { result } = mount(7);
    act(() => result.current.selectTo(4));
    expect(result.current.form).toMatchObject({ kind: "edit", label: "" });
  });

  it("drops the form when the selection is dropped", () => {
    const { result } = mount(7);
    act(() => result.current.selectTo(null));
    expect(result.current.form).toBeNull();
  });

  it("opens a create form seeded from the placement that was just written", () => {
    const { result } = mount();
    act(() => result.current.openNew(4));
    expect(result.current.form).toMatchObject({
      kind: "new",
      label: "",
      transform: { position: TANK.position },
    });
  });

  it("selects the object it opens on, so the block has something to sit under", () => {
    const { result } = mount();
    act(() => result.current.openNew(4));
    expect(select).toHaveBeenCalledWith(4);
  });

  it("closes a create form when the reader selects something else", () => {
    const { result } = mount();
    act(() => result.current.openNew(4));
    act(() => result.current.selectTo(7));
    expect(result.current.form).toMatchObject({ kind: "edit", label: "West valve" });
  });

  it("opens an edit form on the label the object already carries", () => {
    const { result } = mount();
    act(() => result.current.openRename(7));
    expect(result.current.form).toMatchObject({ kind: "edit", label: "West valve" });
  });

  it("opens nothing for an id the editor does not hold", () => {
    const { result } = mount();
    act(() => result.current.openNew(999));
    expect(result.current.form).toBeNull();
  });

  it("keeps the typed label", () => {
    const { result } = mount();
    act(() => result.current.openNew(4));
    act(() => result.current.form?.onLabel("Tank 4, north row"));
    expect(result.current.form?.label).toBe("Tank 4, north row");
  });

  it("keeps the edited transform", () => {
    const { result } = mount();
    act(() => result.current.openNew(4));
    const moved = { ...TANK, position: { x: 1, y: 2, z: 3 } };
    act(() => result.current.form?.onTransform(moved));
    expect(result.current.form?.transform.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("shows a gizmo drag in the cells until the reader types into them", () => {
    const { result, rerender } = mount(7);
    list = [TANK, { ...VALVE, position: MOVED }];
    rerender();
    expect(result.current.form?.transform.position).toEqual(MOVED);

    act(() => result.current.form?.onTransform({ ...VALVE, position: { x: 9, y: 9, z: 9 } }));
    list = [TANK, { ...VALVE, position: { x: 5, y: 5, z: 5 } }];
    rerender();
    expect(result.current.form?.transform.position).toEqual({ x: 9, y: 9, z: 9 });
  });

  it("saves the numbers the reader typed, transform and label together", async () => {
    const { result } = mount();
    act(() => result.current.openNew(4));
    act(() => result.current.form?.onLabel("Tank 4"));
    act(() =>
      result.current.form?.onTransform({
        position: { x: 1, y: 2, z: 3 },
        rotation: TANK.rotation,
        scale: TANK.scale,
      }),
    );
    await act(async () => result.current.form?.onSave());
    expect(update).toHaveBeenCalledWith(4, {
      position: { x: 1, y: 2, z: 3 },
      rotation: TANK.rotation,
      scale: TANK.scale,
      label: "Tank 4",
    });
  });

  it("saves an untouched form against the transform the scene committed meanwhile", async () => {
    // The gizmo stays live under the form, and a drag PUTs its own transform:
    // place, drag into position, name it, is the flow the picker exists for.
    // Sending the draft's copy back would push the pre-drag numbers over it.
    const sent: unknown[] = [];
    rename.mockImplementation(async (id, label) => {
      const p = list.find((x) => x.id === id)!;
      sent.push({ position: p.position, rotation: p.rotation, scale: p.scale, label });
    });
    const { result, rerender } = mount();

    act(() => result.current.openNew(4));
    list = [{ ...TANK, position: MOVED }, VALVE];
    rerender();
    act(() => result.current.form?.onLabel("Tank 4"));
    await act(async () => result.current.form?.onSave());

    expect(update).not.toHaveBeenCalled();
    expect(sent).toEqual([
      { position: MOVED, rotation: TANK.rotation, scale: TANK.scale, label: "Tank 4" },
    ]);
  });

  it("sends the typed numbers on an edit too — the cells are not read-only any more", async () => {
    const { result } = mount(7);
    act(() => result.current.form?.onLabel("East valve"));
    act(() =>
      result.current.form?.onTransform({
        position: { x: 1, y: 2, z: 3 },
        rotation: VALVE.rotation,
        scale: VALVE.scale,
      }),
    );
    await act(async () => result.current.form?.onSave());
    expect(update).toHaveBeenCalledWith(7, {
      position: { x: 1, y: 2, z: 3 },
      rotation: VALVE.rotation,
      scale: VALVE.scale,
      label: "East valve",
    });
  });

  it("sends a rename when only the label was touched", async () => {
    const { result } = mount(7);
    act(() => result.current.form?.onLabel("East valve"));
    await act(async () => result.current.form?.onSave());
    expect(rename).toHaveBeenCalledWith(7, "East valve");
    expect(update).not.toHaveBeenCalled();
  });

  it("stays open on what was just saved — the block is always a form", async () => {
    // The list here never adopts the save, so a draft merely re-derived from it
    // would show the old label back: what stays on screen is what went out.
    const { result } = mount(7);
    act(() => result.current.form?.onLabel("East valve"));
    act(() => result.current.form?.onTransform({ ...VALVE, position: { x: 9, y: 9, z: 9 } }));
    await act(async () => result.current.form?.onSave());
    expect(result.current.form).toMatchObject({ kind: "edit", label: "East valve" });
    // Untouched again: the cells follow the scene rather than the sent copy.
    expect(result.current.form?.transform.position).toEqual(VALVE.position);
  });

  it("turns a saved create into an edit", async () => {
    const { result } = mount();
    act(() => result.current.openNew(4));
    await act(async () => result.current.form?.onSave());
    expect(result.current.form?.kind).toBe("edit");
  });

  it("deletes the placement when a create is cancelled — it was already written", async () => {
    const { result } = mount();
    act(() => result.current.openNew(4));
    await act(async () => result.current.form?.onCancel());
    expect(remove).toHaveBeenCalledWith(4);
    expect(select).toHaveBeenLastCalledWith(null);
    expect(result.current.form).toBeNull();
  });

  it("resets an edit to the object's own values on cancel, and asks the server for nothing", async () => {
    const { result } = mount(7);
    act(() => result.current.form?.onLabel("East valve"));
    act(() => result.current.form?.onTransform({ ...VALVE, position: { x: 9, y: 9, z: 9 } }));
    await act(async () => result.current.form?.onCancel());
    expect(result.current.form).toMatchObject({ kind: "edit", label: "West valve" });
    expect(result.current.form?.transform.position).toEqual(VALVE.position);
    for (const fn of [update, rename, remove]) expect(fn).not.toHaveBeenCalled();
  });

  it("reads as saving only while this object's own mutation is in flight", () => {
    mutation = mutating(4);
    const { result } = mount();
    act(() => result.current.openNew(4));
    expect(result.current.form?.saving).toBe(true);
  });

  it("does not read as saving while another object is being written", () => {
    mutation = mutating(7);
    const { result } = mount();
    act(() => result.current.openNew(4));
    expect(result.current.form?.saving).toBe(false);
  });
});
