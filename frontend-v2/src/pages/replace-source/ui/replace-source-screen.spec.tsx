import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stagesFor } from "../model/replace-form";
import type { ReplaceSourceState } from "../model/use-replace-source";
import { ReplaceSourceScreen } from "./replace-source-screen";

const { useReplaceSource } = vi.hoisted(() => ({ useReplaceSource: vi.fn() }));
vi.mock("../model/use-replace-source", () => ({ useReplaceSource }));
// A stand-in for the router context: the screen is rendered on its own.
vi.mock("@tanstack/react-router", () => ({ useParams: () => ({ slug: "refinery-block-c" }) }));

const TERRITORY = {
  slug: "refinery-block-c",
  title: "Refinery Block C",
  sourceBlobHash: "h".repeat(64),
  placementCount: 0,
  createdAt: "2026-09-02T00:00:00Z",
};

const READY: ReplaceSourceState = {
  status: "ready",
  territory: TERRITORY,
  currentSize: 1024,
  phase: "idle",
  file: null,
  onFiles: vi.fn(),
  onReplace: vi.fn(),
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
  canReplace: true,
  stages: stagesFor("idle", null),
};

beforeEach(() => useReplaceSource.mockReset());

describe("ReplaceSourceScreen", () => {
  it("shows a loading skeleton", () => {
    useReplaceSource.mockReturnValue({ status: "loading" });
    render(<ReplaceSourceScreen />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("says the territory was not found, with a way back", () => {
    useReplaceSource.mockReturnValue({ status: "missing" });
    render(<ReplaceSourceScreen />);
    expect(screen.getByText("Territory not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /territor/i })).toHaveAttribute("href", "/territories");
  });

  it("reports an unavailable territory", () => {
    useReplaceSource.mockReturnValue({ status: "unavailable", error: "gateway down" });
    render(<ReplaceSourceScreen />);
    expect(screen.getByText(/gateway down/)).toBeInTheDocument();
  });

  it("draws the page once ready", () => {
    useReplaceSource.mockReturnValue(READY);
    render(<ReplaceSourceScreen />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Swap the 3D source of Refinery Block C" }),
    ).toBeInTheDocument();
  });
});
