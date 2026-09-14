import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { batchMix, batchStats, makeRow, MODEL_CHECKLIST, type QueueRow } from "../model/batch";
import { UploadModelsPage, type UploadModelsPageProps } from "./upload-models-page";

const file = (name: string, size = 1024): File => {
  const f = new File([new Uint8Array(16)], name);
  Object.defineProperty(f, "size", { value: size });
  return f;
};

const ROWS: QueueRow[] = [
  { ...makeRow(file("pump-jack-unit.zip", 38 * 1024 * 1024)), status: "done" },
  { ...makeRow(file("storage-tank-500.zip", 96 * 1024 * 1024)), status: "done" },
  { ...makeRow(file("valve-assembly.zip", 184 * 1024 * 1024)), status: "uploading", progress: 0.62 },
  { ...makeRow(file("pipe-rack-b7.zip", 742 * 1024 * 1024)) },
  { ...makeRow(file("flare-stack.zip", 84 * 1024 * 1024)), status: "failed", error: "OBJ parse error at line 84120" },
];

const props = (over: Partial<UploadModelsPageProps> = {}): UploadModelsPageProps => ({
  rows: ROWS,
  onFiles: vi.fn(),
  onTitle: vi.fn(),
  onRemove: vi.fn(),
  onThumbnail: vi.fn(),
  onClearDone: vi.fn(),
  onRun: vi.fn(),
  onCancel: vi.fn(),
  running: false,
  mix: batchMix(ROWS),
  stats: batchStats(ROWS),
  checks: MODEL_CHECKLIST,
  canUpload: true,
  failedNames: ["flare-stack.zip"],
  ...over,
});

describe("UploadModelsPage", () => {
  it("names the page with one h1, the back link and the lede", () => {
    render(<UploadModelsPage {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "New models" })).toBeInTheDocument();
    expect(screen.getByText("Upload · batch")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Model library" })).toHaveAttribute("href", "/models");
    expect(
      screen.getByText(
        "One ZIP per model: OBJ + MTL + textures. Titles autofill from filenames — edit before submitting. Each upload runs in 8 MB chunks, one row at a time.",
      ),
    ).toBeInTheDocument();
  });

  it("draws no chrome of its own — the shell owns the layout", () => {
    render(<UploadModelsPage {...props()} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("shows the batch progress meter and the k of n done detail", () => {
    render(<UploadModelsPage {...props()} />);
    expect(screen.getByText("Batch progress")).toBeInTheDocument();
    expect(screen.getByText("2 of 5 done")).toBeInTheDocument();
  });

  it("shows the three stat tiles", () => {
    render(<UploadModelsPage {...props()} />);
    expect(screen.getByText("Archives")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Chunk size")).toBeInTheDocument();
    expect(screen.getByText("8 MB")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("drops several files at once onto onFiles", async () => {
    const onFiles = vi.fn();
    render(<UploadModelsPage {...props({ onFiles })} />);
    const input = screen.getByLabelText("Drop ZIP archives here") as HTMLInputElement;
    expect(input).toHaveAttribute("multiple");
    const a = new File(["x"], "a.zip");
    const b = new File(["x"], "b.zip");
    await userEvent.upload(input, [a, b]);
    expect(onFiles).toHaveBeenCalledWith([a, b]);
  });

  it("renders one card per queued row and clears done ones", async () => {
    const onClearDone = vi.fn();
    render(<UploadModelsPage {...props({ onClearDone })} />);
    expect(screen.getByText("valve-assembly.zip")).toBeInTheDocument();
    expect(screen.getByText("flare-stack.zip")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "clear done" }));
    expect(onClearDone).toHaveBeenCalledOnce();
  });

  it("reads Upload N models while idle and runs on click", async () => {
    const onRun = vi.fn();
    render(<UploadModelsPage {...props({ onRun })} />);
    const button = screen.getByRole("button", { name: "Upload 5 models" });
    await userEvent.click(button);
    expect(onRun).toHaveBeenCalledOnce();
  });

  it("reads Uploading k of n… while running, and offers Cancel batch", async () => {
    const onCancel = vi.fn();
    const current = { row: ROWS[2], progress: { bytes: 1, total: 2, chunk: 1, chunks: 2 }, stats: { chunk: "1 / 2", speed: "1 MB/s" } };
    render(<UploadModelsPage {...props({ running: true, current, onCancel })} />);
    expect(screen.getByRole("button", { name: "Uploading 3 of 5…" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel batch" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("hides Cancel batch while idle", () => {
    render(<UploadModelsPage {...props()} />);
    expect(screen.queryByRole("button", { name: "Cancel batch" })).not.toBeInTheDocument();
  });

  it("reads a bare Uploading… before the current row has reported anything", () => {
    render(<UploadModelsPage {...props({ running: true })} />);
    expect(screen.getByRole("button", { name: "Uploading…" })).toBeInTheDocument();
  });

  it("wires each row's remove, title and thumbnail controls to its own id", async () => {
    const onRemove = vi.fn();
    const onTitle = vi.fn();
    const onThumbnail = vi.fn();
    render(<UploadModelsPage {...props({ onRemove, onTitle, onThumbnail })} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove flare-stack.zip" }));
    expect(onRemove).toHaveBeenCalledWith(ROWS[4].id);

    await userEvent.type(screen.getByRole("textbox", { name: "Title for flare-stack.zip" }), "!");
    expect(onTitle).toHaveBeenCalledWith(ROWS[4].id, expect.any(String));

    const thumb = new File(["x"], "cover.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText(`Add thumbnail for ${ROWS[3].file.name}`), thumb);
    expect(onThumbnail).toHaveBeenCalledWith(ROWS[3].id, thumb);
  });

  it("disables the upload button when nothing is runnable", () => {
    const done: QueueRow = { ...makeRow(file("a.zip")), status: "done" };
    render(<UploadModelsPage {...props({ rows: [done], mix: batchMix([done]), stats: batchStats([done]) })} />);
    expect(screen.getByRole("button", { name: "Upload 1 model" })).toBeDisabled();
  });

  it("reads singular copy for a one-row queue: 1 model, 1 archive", () => {
    const queued: QueueRow = makeRow(file("a.zip"));
    render(
      <UploadModelsPage
        {...props({ rows: [queued], mix: batchMix([queued]), stats: batchStats([queued]) })}
      />,
    );
    expect(screen.getByRole("button", { name: "Upload 1 model" })).toBeInTheDocument();
    expect(screen.getByText(/^1 archive ·/)).toBeInTheDocument();
  });

  it("hides the Queue heading and the run button with an empty queue, but keeps the drop zone and aside", () => {
    render(<UploadModelsPage {...props({ rows: [], mix: batchMix([]), stats: batchStats([]) })} />);
    expect(screen.queryByText("Queue")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Upload /i })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Drop ZIP archives here")).toBeInTheDocument();
    expect(screen.getByText("Before you submit")).toBeInTheDocument();
  });

  it("carries the sequential note verbatim", () => {
    render(<UploadModelsPage {...props()} />);
    expect(
      screen.getByText("rows upload sequentially · titles lock once a row starts"),
    ).toBeInTheDocument();
  });

  it("names every failed file in the aside", () => {
    render(<UploadModelsPage {...props()} />);
    expect(screen.getByText(/flare-stack\.zip failed/)).toBeInTheDocument();
  });

  it("replaces the whole form with a callout when the viewer may not upload", () => {
    render(<UploadModelsPage {...props({ canUpload: false })} />);
    expect(screen.getByText("Uploading models needs model:write.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Drop ZIP archives here")).not.toBeInTheDocument();
    expect(screen.queryByText("Before you submit")).not.toBeInTheDocument();
  });
});
