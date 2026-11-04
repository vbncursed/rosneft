import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPlacements,
  deletePlacement,
  IDENTITY_TRANSFORM,
  updatePlacement,
  type Placement,
} from "@/entities/placement";
import { usePlacementsEditor } from "@/features/placements-editor";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { SelectedBlock } from "@/widgets/placements-panel";
import { usePlacementForm } from "./use-placement-form";

vi.mock("@/entities/placement", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createPlacements: vi.fn(),
  updatePlacement: vi.fn(),
  deletePlacement: vi.fn(),
}));
const placement = (id: number): Placement => ({
  id,
  territorySlug: "t",
  modelSlug: "tank",
  label: `Tank ${id}`,
  updatedAt: "now",
  visiblePanoramaIds: [],
  hidden: false,
  groupId: null,
  ...IDENTITY_TRANSFORM,
});
const changed = vi.fn();

function Viewer() {
  const [id, select] = useState<number | null>(7);
  const editor = usePlacementsEditor({
    slug: "t",
    initial: [{ ...placement(7), chain: [] }],
    options: [],
    territoryMaxDim: 1,
    panoramaIds: [],
    onChanged: changed,
  });
  const form = usePlacementForm(editor, select, id);
  const notices = useNotices();
  const selected = editor.placements.find((p) => p.id === id);
  return (
    <>
      <button
        onClick={async () => {
          const created = await editor.create("tank", 1);
          if (created !== null) form.openNew(created);
        }}
      >
        Place another tank
      </button>
      {selected && (
        <SelectedBlock
          name={`Tank ${selected.id}`}
          gizmo="translate"
          onGizmo={() => {}}
          transform={selected}
          snap={false}
          onSnap={() => {}}
          canWrite
          form={form.form}
          compact={false}
        />
      )}
      {notices.map((notice) => (
        <p key={notice.id}>{notice.message}</p>
      ))}
    </>
  );
}

describe("placement form save during a subsequent create", () => {
  beforeEach(() => {
    vi.mocked(createPlacements)
      .mockReset()
      .mockResolvedValue([placement(4)]);
    vi.mocked(deletePlacement).mockReset().mockResolvedValue(undefined);
    vi.mocked(updatePlacement).mockReset();
    changed.mockReset();
    clearNotices();
  });

  it.each(["resolved", "rejected"] as const)(
    "keeps the new tank's Cancel deleting it after the old PUT %s",
    async (outcome) => {
      let resolve!: (value: Placement) => void;
      let reject!: (reason: Error) => void;
      vi.mocked(updatePlacement).mockImplementation(
        () =>
          new Promise<Placement>((yes, no) => {
            resolve = yes;
            reject = no;
          }),
      );
      render(
        <StrictMode>
          <Viewer />
        </StrictMode>,
      );
      fireEvent.change(screen.getByRole("textbox", { name: "Label" }), { target: { value: "Saved old tank" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Place another tank" })));
      expect(screen.getByText("Tank 4")).toBeInTheDocument();
      expect(screen.getByText("Selected · new")).toBeInTheDocument();
      fireEvent.change(screen.getByRole("textbox", { name: "Label" }), { target: { value: "Unsaved new tank" } });
      await act(async () => {
        if (outcome === "resolved") resolve({ ...placement(7), label: "Saved old tank" });
        else reject(new HttpError(400, null, "PUT refused"));
      });
      if (outcome === "rejected") expect(screen.getByText("PUT refused")).toBeInTheDocument();
      expect(screen.getByText("Selected · new")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Label" })).toHaveValue("Unsaved new tank");
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
      expect(deletePlacement).toHaveBeenCalledExactlyOnceWith("t", 4);
      expect(screen.queryByRole("textbox", { name: "Label" })).toBeNull();
    },
  );
  it("keeps a refused new draft so Cancel deletes it", async () => {
    vi.mocked(updatePlacement).mockRejectedValue(new HttpError(400, null, "PUT refused"));
    render(
      <StrictMode>
        <Viewer />
      </StrictMode>,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Place another tank" })));
    expect(screen.getByText("Selected · new")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(screen.getByText("PUT refused")).toBeInTheDocument();
    expect(screen.getByText("Selected · new")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
    expect(deletePlacement).toHaveBeenCalledExactlyOnceWith("t", 4);
  });
  it.each(["new", "edit"] as const)("keeps typed values after a refused %s save", async (kind) => {
    vi.mocked(updatePlacement).mockRejectedValue(new HttpError(400, null, "PUT refused"));
    render(<Viewer />);
    if (kind === "new")
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Place another tank" })));
    changed.mockClear();
    fireEvent.change(screen.getByRole("textbox", { name: "Label" }), { target: { value: "My tank" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Pos x" }), { target: { value: "3" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Pos x" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(screen.getAllByText("PUT refused")).toHaveLength(1);
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveValue("My tank");
    expect(screen.getByRole("textbox", { name: "Pos x" })).toHaveValue("3.000");
    if (kind === "new") expect(screen.getByText("Selected · new")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
    if (kind === "new") expect(deletePlacement).toHaveBeenCalledExactlyOnceWith("t", 4);
    else expect(deletePlacement).not.toHaveBeenCalled();
  });

  it("acknowledges a new draft only after a successful retry", async () => {
    vi.mocked(updatePlacement)
      .mockRejectedValueOnce(new HttpError(400, null, "PUT refused"))
      .mockResolvedValueOnce({ ...placement(4), label: "My tank" });
    render(<Viewer />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Place another tank" })));
    fireEvent.change(screen.getByRole("textbox", { name: "Label" }), { target: { value: "My tank" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(screen.getByText("Selected · new")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(screen.getByText("Selected")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
    expect(deletePlacement).not.toHaveBeenCalled();
  });
});
