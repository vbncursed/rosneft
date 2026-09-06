import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Model } from "@/entities/model";
import { ModelAside, type ModelAsideProps } from "./model-aside";

const MODEL: Model = {
  slug: "valve-assembly",
  title: "Valve Assembly",
  sourceBlobHash: "a".repeat(64),
  usageCount: 2,
};

const artifact = (lod: number) => ({
  lod,
  hash: `h${lod}`,
  size: 1024,
  faces: 18412,
  vertices: 30000,
  bboxMin: { x: 0, y: 0, z: 0 },
  bboxMax: { x: 1.2, y: 1.8, z: 0.9 },
});

const props = (over: Partial<ModelAsideProps> = {}): ModelAsideProps => ({
  model: MODEL,
  status: "ready",
  artifacts: [artifact(0), artifact(1), artifact(2)],
  jobError: null,
  canWrite: true,
  thumbnailBusy: false,
  onThumbnail: vi.fn(),
  onRemoveThumbnail: vi.fn(),
  ...over,
});

describe("ModelAside", () => {
  it("shows the description, or the fallback sentence when there is none", () => {
    const { rerender } = render(<ModelAside {...props({ model: { ...MODEL, description: "Gate valve." } })} />);
    expect(screen.getByText("Gate valve.")).toBeInTheDocument();
    rerender(<ModelAside {...props()} />);
    expect(screen.getByText("No description.")).toBeInTheDocument();
  });

  it("lists the About facts by label", () => {
    render(<ModelAside {...props()} />);
    expect(screen.getByText("slug")).toBeInTheDocument();
    expect(screen.getByText("triangles")).toBeInTheDocument();
    expect(screen.getByText("hash")).toBeInTheDocument();
    expect(screen.getByText("placed")).toBeInTheDocument();
  });

  it("names the Artifacts card with the LOD count and one link per file", () => {
    render(<ModelAside {...props()} />);
    expect(screen.getByText("Artifacts")).toBeInTheDocument();
    expect(screen.getByText("3 LODs")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /valve-assembly-lod0\.glb/ })).toHaveAttribute(
      "href",
      "/api/assets/h0",
    );
    expect(screen.getByRole("link", { name: /valve-assembly-lod1\.glb/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /valve-assembly-lod2\.glb/ })).toBeInTheDocument();
  });

  it("says nothing converted yet while pending, with no links", () => {
    render(<ModelAside {...props({ artifacts: [], status: "pending" })} />);
    expect(screen.getByText("Not converted yet")).toBeInTheDocument();
    expect(screen.getByText("Artifacts appear when the conversion finishes.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("reports the worker's failure, falling back to a generic sentence", () => {
    const { rerender } = render(
      <ModelAside {...props({ artifacts: [], status: "failed", jobError: "OBJ parse error" })} />,
    );
    expect(screen.getByText("Conversion failed")).toBeInTheDocument();
    expect(screen.getByText("OBJ parse error")).toBeInTheDocument();
    rerender(<ModelAside {...props({ artifacts: [], status: "failed", jobError: null })} />);
    expect(screen.getByText("The worker rejected the archive.")).toBeInTheDocument();
  });

  it("offers replace and remove only with write access and an existing thumbnail", () => {
    const { rerender } = render(
      <ModelAside {...props({ canWrite: true, model: { ...MODEL, thumbnailBlobHash: "t" } })} />,
    );
    expect(screen.getByRole("button", { name: "replace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "remove" })).toBeInTheDocument();

    rerender(<ModelAside {...props({ canWrite: false, model: { ...MODEL, thumbnailBlobHash: "t" } })} />);
    expect(screen.queryByRole("button", { name: "replace" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "remove" })).not.toBeInTheDocument();
  });

  it("offers upload, not replace, when there is no thumbnail yet", () => {
    render(<ModelAside {...props({ canWrite: true })} />);
    expect(screen.getByRole("button", { name: "upload" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "replace" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "remove" })).not.toBeInTheDocument();
  });

  it("shows a disabled uploading state while the thumbnail mutation is busy", () => {
    render(<ModelAside {...props({ canWrite: true, thumbnailBusy: true })} />);
    expect(screen.getByRole("button", { name: "uploading…" })).toBeDisabled();
  });

  it("calls onRemoveThumbnail from the remove action", async () => {
    const onRemoveThumbnail = vi.fn();
    render(
      <ModelAside
        {...props({ canWrite: true, model: { ...MODEL, thumbnailBlobHash: "t" }, onRemoveThumbnail })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "remove" }));
    expect(onRemoveThumbnail).toHaveBeenCalled();
  });

  it("hands a picked file to onThumbnail through the hidden input", async () => {
    const onThumbnail = vi.fn();
    render(<ModelAside {...props({ canWrite: true, onThumbnail })} />);
    const file = new File(["x"], "thumb.png", { type: "image/png" });
    const input = screen.getByLabelText("Thumbnail file");
    await userEvent.upload(input, file);
    expect(onThumbnail).toHaveBeenCalledWith(file);
  });
});
