import { act, renderHook } from "@testing-library/react";
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

const select = vi.fn();
let mutation: MutationState;
const update = vi.fn<FormEditor["update"]>();
const rename = vi.fn<FormEditor["rename"]>();
const remove = vi.fn<FormEditor["remove"]>();

const editor = (): FormEditor => ({ placements: [TANK, VALVE], mutation, update, rename, remove });
const mount = () => renderHook(() => usePlacementForm(editor(), select));

describe("usePlacementForm", () => {
  beforeEach(() => {
    mutation = idle;
    select.mockReset();
    for (const fn of [update, rename, remove]) fn.mockReset().mockResolvedValue(undefined);
  });

  it("draws no form until one is opened", () => {
    expect(mount().result.current.form).toBeNull();
  });

  it("opens a create form seeded from the placement that was just written", () => {
    const { result } = mount();
    act(() => result.current.openNew(4));
    expect(result.current.form).toMatchObject({ kind: "new", label: "", transform: { position: TANK.position } });
  });

  it("selects the object it opens on, so the block has something to sit under", () => {
    const { result } = mount();
    act(() => result.current.openNew(4));
    expect(select).toHaveBeenCalledWith(4);
  });

  it("opens a rename form on the label the object already carries", () => {
    const { result } = mount();
    act(() => result.current.openRename(7));
    expect(result.current.form).toMatchObject({ kind: "rename", label: "West valve" });
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

  it("saves an untouched create against the transform the scene committed meanwhile", async () => {
    // The gizmo stays live while the form is open, and a drag PUTs its own
    // transform: place, drag into position, name it, is the flow the picker
    // exists for. The draft was copied when the form opened, so Save used to
    // push that pre-drag copy back over the drag.
    const sent: unknown[] = [];
    let list = [TANK, VALVE];
    rename.mockImplementation(async (id, label) => {
      const p = list.find((x) => x.id === id)!;
      sent.push({ position: p.position, rotation: p.rotation, scale: p.scale, label });
    });
    const { result, rerender } = renderHook(() =>
      usePlacementForm({ placements: list, mutation, update, rename, remove }, select),
    );

    act(() => result.current.openNew(4));
    // The drag landed: the editor now holds the moved placement.
    list = [{ ...TANK, position: { x: 0.749, y: 0, z: 0 } }, VALVE];
    rerender();
    act(() => result.current.form?.onLabel("Tank 4"));
    await act(async () => result.current.form?.onSave());

    expect(update).not.toHaveBeenCalled();
    expect(sent).toEqual([
      {
        position: { x: 0.749, y: 0, z: 0 },
        rotation: TANK.rotation,
        scale: TANK.scale,
        label: "Tank 4",
      },
    ]);
  });

  it("saves a rename as a rename — the numbers were never editable there", async () => {
    const { result } = mount();
    act(() => result.current.openRename(7));
    act(() => result.current.form?.onLabel("East valve"));
    await act(async () => result.current.form?.onSave());
    expect(rename).toHaveBeenCalledWith(7, "East valve");
    expect(update).not.toHaveBeenCalled();
  });

  it("closes the form once the save has landed", async () => {
    const { result } = mount();
    act(() => result.current.openNew(4));
    await act(async () => result.current.form?.onSave());
    expect(result.current.form).toBeNull();
  });

  it("deletes the placement when a create is cancelled — it was already written", async () => {
    const { result } = mount();
    act(() => result.current.openNew(4));
    await act(async () => result.current.form?.onCancel());
    expect(remove).toHaveBeenCalledWith(4);
    expect(select).toHaveBeenLastCalledWith(null);
    expect(result.current.form).toBeNull();
  });

  it("leaves the placement alone when a rename is cancelled", async () => {
    const { result } = mount();
    act(() => result.current.openRename(7));
    await act(async () => result.current.form?.onCancel());
    expect(remove).not.toHaveBeenCalled();
    expect(result.current.form).toBeNull();
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

  it("closes on demand without touching the editor", () => {
    const { result } = mount();
    act(() => result.current.openRename(7));
    act(() => result.current.close());
    expect(result.current.form).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });
});
