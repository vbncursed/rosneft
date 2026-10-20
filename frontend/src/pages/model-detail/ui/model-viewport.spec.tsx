import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Artifact } from "@/entities/content";
import type { LodReport, ModelCanvasProps } from "@/widgets/viewer-canvas";
import { ModelViewport, type ModelViewportProps } from "./model-viewport";

const { seen } = vi.hoisted(() => ({ seen: { props: null as null | ModelCanvasProps } }));
vi.mock("@/widgets/viewer-canvas", () => ({
  ModelCanvas: (p: ModelCanvasProps) => {
    seen.props = p;
    return null;
  },
}));

const artifact = (lod: number): Artifact => ({
  lod,
  hash: `h${lod}`,
  size: 1024,
  faces: 1000,
  vertices: 2000,
  bboxMin: { x: 0, y: 0, z: 0 },
  bboxMax: { x: 1, y: 1, z: 1 },
});
const ARTIFACTS = [artifact(0), artifact(1), artifact(2)];

const report = (over: Partial<LodReport> = {}): LodReport => ({
  shown: null,
  target: null,
  percent: null,
  progressText: null,
  failure: null,
  ...over,
});

const props = (over: Partial<ModelViewportProps> = {}): ModelViewportProps => ({
  slug: "valve-assembly",
  title: "Valve Assembly",
  status: "ready",
  artifacts: ARTIFACTS,
  ...over,
});

beforeEach(() => {
  seen.props = null;
});

describe("ModelViewport", () => {
  it("names the region after the model", () => {
    render(<ModelViewport {...props()} />);
    expect(screen.getByRole("region", { name: "3D preview of Valve Assembly" })).toBeInTheDocument();
  });

  it("never draws a photo, with or without artifacts", () => {
    const { rerender } = render(<ModelViewport {...props()} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    rerender(<ModelViewport {...props({ artifacts: [], status: "pending" })} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it.each([
    ["converting", "Converting"],
    ["failed", "Conversion failed"],
    ["pending", "Not converted yet"],
  ] as const)("without artifacts and status %s says so and mounts no scene", (status, title) => {
    render(<ModelViewport {...props({ artifacts: [], status })} />);
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(seen.props).toBeNull();
  });

  it("hands the scene the same artifacts array it was given", () => {
    render(<ModelViewport {...props()} />);
    expect(seen.props!.lods).toBe(ARTIFACTS);
  });

  it("shows the loading skeleton until the first level is on screen", () => {
    render(<ModelViewport {...props()} />);
    expect(screen.getByText("Loading model…")).toBeInTheDocument();
    act(() => seen.props!.onLod(report({ shown: 2, target: 2 })));
    expect(screen.queryByText("Loading model…")).not.toBeInTheDocument();
  });

  it("shows the upgrade chip while a finer level streams in", () => {
    render(<ModelViewport {...props()} />);
    act(() => seen.props!.onLod(report({ shown: 2, target: 0, percent: 40, progressText: "1.0 / 2.5 MB" })));
    expect(screen.getByText("LOD 2 → 0 · 1.0 / 2.5 MB")).toBeInTheDocument();
  });

  it("names the failed file and retries on Try again", () => {
    render(<ModelViewport {...props()} />);
    act(() => seen.props!.onLod(report({ target: 2, failure: { hash: "h2", status: 502 } })));
    expect(screen.getByRole("alert")).toHaveTextContent("valve-assembly-lod2.glb");
    expect(screen.getByRole("alert")).toHaveTextContent("HTTP 502");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(seen.props!.retryVersion).toBe(1);
  });

  it("says the preview is unavailable when the scene cannot start", () => {
    render(<ModelViewport {...props()} />);
    act(() => seen.props!.onUnavailable());
    expect(screen.getByText("3D preview unavailable")).toBeInTheDocument();
  });
});
