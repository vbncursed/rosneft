import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Model } from "@/entities/model";
import { ModelDetailPage, type ModelDetailPageProps } from "./model-detail-page";
import { focusTip, hoverTip } from "@/shared/ui/tooltip/testing";

const MODEL: Model = {
  slug: "valve-assembly",
  title: "Valve Assembly",
  sourceBlobHash: "a".repeat(64),
  usageCount: 2,
  createdAt: "2026-09-02T10:00:00Z",
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

const props = (over: Partial<ModelDetailPageProps> = {}): ModelDetailPageProps => ({
  model: MODEL,
  status: "ready",
  artifacts: [artifact(0)],
  jobError: null,
  canDelete: true,
  canWrite: true,
  thumbnailBusy: false,
  onDelete: vi.fn(),
  onThumbnail: vi.fn(),
  onRemoveThumbnail: vi.fn(),
  ...over,
});

describe("ModelDetailPage", () => {
  it("names the page with the title, the status badge and the back link", () => {
    render(<ModelDetailPage {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Valve Assembly" })).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Model library" })).toHaveAttribute("href", "/models");
  });

  it("prints the meta line under the title", () => {
    render(<ModelDetailPage {...props()} />);
    expect(screen.getByText("valve-assembly · 1 LODs · 1 KB · created 02.09")).toBeInTheDocument();
  });

  it("downloads LOD 0 through the header action, and omits it without one", () => {
    const { rerender } = render(<ModelDetailPage {...props()} />);
    const link = screen.getByRole("link", { name: /Download GLB/ });
    expect(link).toHaveAttribute("href", "/api/assets/h0");
    expect(link).toHaveAttribute("download", "valve-assembly-lod0.glb");

    rerender(<ModelDetailPage {...props({ artifacts: [] })} />);
    expect(screen.queryByRole("link", { name: /Download GLB/ })).not.toBeInTheDocument();
  });

  it("shows delete only with the grant, disabled with a reason while placed", async () => {
    const { rerender } = render(<ModelDetailPage {...props({ canDelete: false })} />);
    expect(screen.queryByRole("button", { name: "Delete model" })).not.toBeInTheDocument();

    const onDelete = vi.fn();
    rerender(<ModelDetailPage {...props({ canDelete: true, onDelete })} />);
    const button = screen.getByRole("button", { name: "Delete model — in use on 2 territories" });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute("title");
    expect(hoverTip(button.parentElement!)).toHaveTextContent("In use on 2 territories");

    rerender(<ModelDetailPage {...props({ canDelete: true, onDelete, model: { ...MODEL, usageCount: 1 } })} />);
    expect(screen.getByRole("button", { name: "Delete model — in use on 1 territory" })).toBeDisabled();

    rerender(<ModelDetailPage {...props({ canDelete: true, onDelete, model: { ...MODEL, usageCount: 0 } })} />);
    const enabled = screen.getByRole("button", { name: "Delete model" });
    expect(enabled).not.toBeDisabled();
    await userEvent.click(enabled);
    expect(onDelete).toHaveBeenCalled();
  });

  // Answers the press, not only the release; the hover border eases with it.
  it("presses on pointer-down", () => {
    render(<ModelDetailPage {...props()} />);
    expect(screen.getByRole("link", { name: /Download GLB/ })).toHaveClass("transition-[border-color,scale]", "duration-150", "ease-out", "active:scale-[0.97]");
  });
});

describe("ModelDetailPage · keyboard", () => {
  it("names the delete icon Button the moment a keyboard focus lands on it", () => {
    render(<ModelDetailPage {...props({ canDelete: true, model: { ...MODEL, usageCount: 0 } })} />);
    const del = screen.getByRole("button", { name: "Delete model" });
    const tip = focusTip(del);
    expect(tip).toHaveTextContent("Delete model");
    expect(del).toHaveAttribute("aria-describedby", tip!.id);
  });
});
