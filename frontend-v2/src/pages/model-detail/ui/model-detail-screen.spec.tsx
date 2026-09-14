import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Model } from "@/entities/model";
import type { ModelDetailState } from "../model/use-model-detail";
import { ModelDetailScreen } from "./model-detail-screen";

const { useModelDetail, useParams } = vi.hoisted(() => ({
  useModelDetail: vi.fn(),
  useParams: vi.fn(),
}));
vi.mock("../model/use-model-detail", () => ({ useModelDetail }));
vi.mock("@tanstack/react-router", () => ({ useParams: () => useParams() }));

const MODEL: Model = { slug: "valve-assembly", title: "Valve Assembly", sourceBlobHash: "a".repeat(64), usageCount: 2 };

type ReadyState = Extract<ModelDetailState, { phase: "ready" }>;

const readyState = (over: Partial<ReadyState> = {}): ReadyState => ({
  phase: "ready",
  model: MODEL,
  status: "ready",
  artifacts: [],
  jobError: null,
  canDelete: true,
  canWrite: true,
  thumbnailBusy: false,
  onDelete: vi.fn(),
  onThumbnail: vi.fn(),
  onRemoveThumbnail: vi.fn(),
  pending: false,
  confirm: vi.fn(),
  dismiss: vi.fn(),
  deleteBusy: false,
  ...over,
});

beforeEach(() => {
  useModelDetail.mockReset();
  useParams.mockReset().mockReturnValue({ slug: "valve-assembly" });
});

describe("ModelDetailScreen", () => {
  it("shows a loading skeleton", () => {
    useModelDetail.mockReturnValue({ phase: "loading" });
    render(<ModelDetailScreen />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("says the model was not found, with a way back", () => {
    useModelDetail.mockReturnValue({ phase: "missing" });
    render(<ModelDetailScreen />);
    expect(screen.getByText("Model not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Model library" })).toHaveAttribute("href", "/models");
  });

  it("shows the gateway's sentence when unavailable", () => {
    useModelDetail.mockReturnValue({ phase: "unavailable", error: "boom" });
    render(<ModelDetailScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("renders the page when ready", () => {
    useModelDetail.mockReturnValue(readyState());
    render(<ModelDetailScreen />);
    expect(screen.getByRole("heading", { level: 1, name: "Valve Assembly" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("draws the confirm dialog while a delete is pending, and wires confirm/cancel", async () => {
    const confirm = vi.fn();
    const dismiss = vi.fn();
    useModelDetail.mockReturnValue(readyState({ pending: true, confirm, dismiss }));
    render(<ModelDetailScreen />);
    const dialog = screen.getByRole("dialog", { name: "Delete Valve Assembly?" });
    expect(dialog).toHaveTextContent("This cannot be undone.");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(dismiss).toHaveBeenCalled();
  });
});
