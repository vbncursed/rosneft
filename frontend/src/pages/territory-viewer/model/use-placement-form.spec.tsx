import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { StrictMode, useCallback, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { idle, mutating, type MutationState, type ResolvedPlacement } from "@/entities/placement";
import { useViewerMode } from "@/features/viewer-mode";
import { SelectedBlock } from "@/widgets/placements-panel";
import { usePlacementForm, type FormEditor } from "./use-placement-form";

const TANK: ResolvedPlacement = {
  id: 4,
  territorySlug: "refinery-block-c",
  modelSlug: "storage-tank-500",
  label: "",
  updatedAt: "2026-09-09T14:00:00Z",
  visiblePanoramaIds: [],
  hidden: false,
  groupId: null,
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
    return { ...usePlacementForm(editor(), selectTo, id), selectTo, id };
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

  it("hides the previous draft while the new placement has not reached the scene", () => {
    const { result, rerender } = mount(7);
    act(() => result.current.form?.onLabel("Unsaved valve"));
    act(() => result.current.openNew(99));

    expect(result.current.id).toBe(99);
    expect(list.find((p) => p.id === result.current.id)).toBeUndefined();
    expect(result.current.form).toBeNull();

    list = [...list, { ...TANK, id: 99, position: MOVED }];
    rerender();
    expect(result.current.form).toMatchObject({ kind: "new", label: "", transform: { position: MOVED } });
  });

  it("follows selection when it changes during a pending arrival", () => {
    const { result, rerender } = mount(7);
    act(() => result.current.form?.onLabel("Unsaved valve"));
    act(() => result.current.openNew(99));
    act(() => result.current.selectTo(4));
    expect(result.current.id).toBe(4);
    expect(result.current.form).toMatchObject({ kind: "edit", label: "", transform: { position: TANK.position } });

    list = [...list, { ...TANK, id: 99, position: MOVED }];
    rerender();
    expect(result.current.id).toBe(4);
    expect(result.current.form).toMatchObject({ kind: "edit", label: "", transform: { position: TANK.position } });
  });

  it("shows and saves the selected object while a new row is delayed", () => {
    list = [TANK, { ...VALVE, position: MOVED }];
    function Viewer() {
      const [id, setId] = useState<number | null>(7);
      const { form, openNew } = usePlacementForm(editor(), setId, id);
      const selected = list.find((p) => p.id === id);
      return (
        <>
          <button onClick={() => openNew(99)}>Create</button>
          <button onClick={() => setId(4)}>Select tank</button>
          {selected && (
            <SelectedBlock
              name={selected.modelSlug}
              gizmo="translate"
              onGizmo={() => {}}
              transform={selected}
              snap={false}
              onSnap={() => {}}
              canWrite
              form={form}
              compact={false}
            />
          )}
        </>
      );
    }
    const { rerender } = render(<Viewer />);
    fireEvent.change(screen.getByRole("textbox", { name: "Label" }), { target: { value: "Unsaved valve" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.queryByRole("textbox", { name: "Label" })).toBeNull();
    expect(screen.queryByText("valve")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Select tank" }));
    expect(screen.getByText("storage-tank-500")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Pos x" })).toHaveValue("18.200");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(rename).toHaveBeenCalledOnce();
    expect(rename).toHaveBeenCalledWith(4, "");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(remove).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    list = [...list, { ...TANK, id: 99, position: MOVED }];
    rerender(<Viewer />);
    expect(screen.getByText("storage-tank-500")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Pos x" })).toHaveValue("18.200");
  });

  it("keeps the awaited create when the viewer reducer selects it after an async create", async () => {
    const { result, rerender } = renderHook(() => {
      const mode = useViewerMode({
        canWrite: true,
        canMovePoints: false,
        chainOpen: false,
        onCancelChain: () => {},
        onCycle: () => {},
      });
      return { ...usePlacementForm(editor(), mode.select, mode.state.selectedId), mode };
    });
    act(() => result.current.mode.select(7));
    await act(async () => {
      await Promise.resolve();
      result.current.openNew(99);
    });
    expect(result.current.mode.state.selectedId).toBe(99);
    expect(result.current.form).toBeNull();
    list = [...list, { ...TANK, id: 99, position: MOVED }];
    rerender();
    expect(result.current.form).toMatchObject({ kind: "new", label: "", transform: { position: MOVED } });
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

  it("renders once, with no form, for a selection the editor's list does not hold", () => {
    // A render-phase reset that writes null over null is re-rendered rather
    // than bailed out of, and the condition that asked for it is still true:
    // this used to throw "Too many re-renders" and take the whole route with it.
    const { result } = mount(999);
    expect(result.current.form).toBeNull();
  });

  it("keeps a create form a create when Rename is clicked on the object it belongs to", async () => {
    // Cancelling a create deletes the object the picker already POSTed. A
    // pencil click that quietly downgraded the draft to an edit left that
    // object in the scene, unnamed, with nothing to undo it.
    const { result } = mount();
    act(() => result.current.openNew(4));
    act(() => result.current.openRename(4));
    expect(result.current.form?.kind).toBe("new");
    await act(async () => result.current.form?.onCancel());
    expect(remove).toHaveBeenCalledWith(4);
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
    expect(sent).toEqual([{ position: MOVED, rotation: TANK.rotation, scale: TANK.scale, label: "Tank 4" }]);
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
  it("discards a pending create on deselection, including its late arrival, in StrictMode", () => {
    const { result, rerender } = renderHook(
      () => {
        const [id, setId] = useState<number | null>(7);
        return { ...usePlacementForm(editor(), setId, id), setId };
      },
      { wrapper: StrictMode },
    );
    act(() => result.current.openNew(99));
    act(() => result.current.setId(null));
    expect(result.current.form).toBeNull();
    list = [...list, { ...TANK, id: 99 }];
    rerender();
    expect(result.current.form).toBeNull();
    act(() => result.current.setId(99));
    expect(result.current.form?.kind).toBe("edit");
  });

  it("keeps an in-flight save's completion behavior when another create is selected", async () => {
    let finish!: () => void;
    rename.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = mount(7);
    act(() => result.current.form?.onLabel("Sent valve"));
    act(() => result.current.form?.onSave());
    expect(rename).toHaveBeenCalledWith(7, "Sent valve");
    act(() => result.current.openNew(4));
    act(() => result.current.form?.onLabel("New tank"));
    expect(result.current.form?.kind).toBe("new");
    await act(async () => finish());
    expect(result.current.form).toMatchObject({ kind: "edit", label: "New tank" });
  });

  it("does not resurrect a deselected draft when its save finishes", async () => {
    let finish!: () => void;
    update.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = mount(7);
    act(() => result.current.form?.onTransform({ ...VALVE, position: MOVED }));
    act(() => result.current.form?.onSave());
    act(() => result.current.selectTo(null));
    await act(async () => finish());
    expect(result.current.form).toBeNull();
    expect(update).toHaveBeenCalledWith(7, expect.objectContaining({ position: MOVED }));
  });

  it("clears a cancelled create before delete settles and preserves a subsequent selection", async () => {
    let finish!: () => void;
    remove.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = mount();
    act(() => result.current.openNew(4));
    act(() => result.current.form?.onCancel());
    expect(result.current.form).toBeNull();
    expect(remove).toHaveBeenCalledWith(4);
    act(() => result.current.selectTo(7));
    await act(async () => finish());
    expect(result.current.form).toMatchObject({ kind: "edit", label: "West valve" });
  });
  it("ignores callbacks from an unmounted form after deselection", () => {
    const { result } = mount(7);
    const form = result.current.form!;
    act(() => result.current.selectTo(null));
    act(() => form.onLabel("Too late"));
    act(() => form.onTransform({ ...VALVE, position: MOVED }));
    expect(result.current.form).toBeNull();
  });

  it("keeps the draft if its row vanishes and cancel cannot reload it", () => {
    const { result, rerender } = mount(7);
    act(() => result.current.form?.onLabel("Unsaved valve"));
    list = [TANK];
    rerender();
    expect(result.current.form?.transform.position).toEqual(VALVE.position);
    act(() => result.current.form?.onCancel());
    expect(result.current.form?.label).toBe("Unsaved valve");
    expect(remove).not.toHaveBeenCalled();
  });

  it("ignores rename of an unknown object", () => {
    const { result } = mount(7);
    act(() => result.current.openRename(999));
    expect(result.current.id).toBe(7);
    expect(result.current.form?.label).toBe("West valve");
  });

  it("keeps a pending create when rename and its arrival share a commit", () => {
    const { result } = mount(7);
    act(() => {
      result.current.openNew(4);
      result.current.openRename(4);
    });
    expect(result.current.form).toMatchObject({ kind: "new", label: "" });
  });

  it("replaces a pending create when another object is renamed", () => {
    const { result, rerender } = mount(7);
    act(() => result.current.openNew(99));
    act(() => result.current.openRename(4));
    list = [...list, { ...TANK, id: 99 }];
    rerender();
    expect(result.current.form).toMatchObject({ kind: "edit", label: "" });
    expect(result.current.id).toBe(4);
  });
  it("opens an edit when a previously missing selected row arrives", () => {
    const { result, rerender } = mount(99);
    expect(result.current.form).toBeNull();
    list = [...list, { ...VALVE, id: 99 }];
    rerender();
    expect(result.current.form).toMatchObject({ kind: "edit", label: "West valve" });
  });
  it("keeps the selected form when an earlier edit's cancel callback runs", () => {
    const { result } = mount(7);
    const oldForm = result.current.form!;
    act(() => result.current.selectTo(4));
    act(() => oldForm.onCancel());
    expect(result.current.form).toMatchObject({ kind: "edit", label: "", transform: { position: TANK.position } });
    act(() => result.current.form?.onSave());
    expect(rename).toHaveBeenCalledWith(4, "");
  });
  it("keeps arrival priority if an earlier edit's cancel runs while a create waits", () => {
    const { result, rerender } = mount(7);
    const oldForm = result.current.form!;
    act(() => result.current.openNew(99));
    act(() => oldForm.onCancel());
    // Existing retained callbacks can re-seed an edit while the create waits.
    // Arrival still owns the eventual new draft and its cancelling delete.
    expect(result.current.form).toMatchObject({ kind: "edit", label: "West valve" });
    list = [...list, { ...TANK, id: 99 }];
    rerender();
    expect(result.current.form).toMatchObject({ kind: "new", label: "" });
    act(() => result.current.form?.onCancel());
    expect(remove).toHaveBeenCalledWith(99);
  });
  it("keeps a retained edit on returning to its selection after that row disappears", () => {
    const { result, rerender } = mount(7);
    const oldForm = result.current.form!;
    act(() => result.current.openNew(99));
    act(() => oldForm.onCancel());
    list = [];
    rerender();
    act(() => result.current.selectTo(7));
    expect(result.current.form).toMatchObject({ kind: "edit", label: "West valve" });
  });
});
