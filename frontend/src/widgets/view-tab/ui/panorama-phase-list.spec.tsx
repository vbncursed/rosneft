import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ALL_PHASES_SHOWN } from "@/entities/panorama";
import { PanoramaPhaseList, type PanoramaPhaseListProps } from "./panorama-phase-list";
import type { PanoramaRowView } from "./panorama-row";

const row = (id: number, over: Partial<PanoramaRowView> = {}): PanoramaRowView => ({
  id,
  title: `Capture ${id}`,
  thumbUrl: null,
  active: false,
  calibrated: true,
  canEdit: true,
  editing: false,
  phase: "prior",
  hidden: false,
  ...over,
});

const props = (over: Partial<PanoramaPhaseListProps> = {}): PanoramaPhaseListProps => ({
  id: "list",
  open: true,
  rows: [row(1), row(2, { phase: "post" })],
  phases: {
    hidden: ALL_PHASES_SHOWN,
    canWrite: true,
    pendingIds: [],
    pendingPhases: [],
    onSetHidden: vi.fn(),
    onMove: vi.fn(),
    onSetPhaseHidden: vi.fn(),
  },
  onEnter: vi.fn(),
  onExit: vi.fn(),
  onEdit: vi.fn(),
  ...over,
});

const phase = (name: string) => screen.getByRole("button", { name });

describe("PanoramaPhaseList", () => {
  it("lists all three job phases for an editor, in order, the empty one too, with counts", () => {
    render(<PanoramaPhaseList {...props()} />);
    expect(screen.getAllByRole("button", { expanded: true }).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Prior job",
      "Current job",
      "Post job",
    ]);
    expect(phase("Prior job")).toHaveTextContent("1 panorama");
    expect(phase("Current job")).toHaveTextContent("No panoramas");
  });

  it("gives a reader only phases with something shown, and no eye or move anywhere", () => {
    const p = props({ rows: [row(1, { canEdit: false })] });
    render(<PanoramaPhaseList {...p} phases={{ ...p.phases, canWrite: false }} />);
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Hide/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Move/ })).toBeNull();
  });

  it("toggles a phase's own flag from its eye", async () => {
    const p = props();
    render(<PanoramaPhaseList {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Hide phase Current job" }));
    expect(p.phases.onSetPhaseHidden).toHaveBeenCalledWith("current", true);
  });

  it("reads a hidden phase as pressed, says so in its line, and dims its rows", () => {
    const p = props();
    render(<PanoramaPhaseList {...p} phases={{ ...p.phases, hidden: { ...ALL_PHASES_SHOWN, post: true } }} />);
    expect(screen.getByRole("button", { name: "Hide phase Post job" })).toHaveAttribute("aria-pressed", "true");
    expect(phase("Post job")).toHaveTextContent("1 panorama · hidden");
    expect(screen.getByText("Capture 2")).toHaveClass("opacity-55");
    expect(screen.getByText("Capture 1")).not.toHaveClass("opacity-55");
  });

  it("waits a phase's eye while its write is in flight", () => {
    const p = props();
    render(<PanoramaPhaseList {...p} phases={{ ...p.phases, pendingPhases: ["prior"] }} />);
    expect(screen.getByRole("button", { name: "Hide phase Prior job" })).toHaveAttribute("aria-busy", "true");
  });

  it("hides one row from its own eye, and moves it to another phase", async () => {
    const p = props();
    render(<PanoramaPhaseList {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Hide panorama Capture 1" }));
    expect(p.phases.onSetHidden).toHaveBeenCalledWith([1], true);
    await userEvent.click(screen.getByRole("button", { name: "Move Capture 1 to another phase" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Current job" }));
    expect(p.phases.onMove).toHaveBeenCalledWith([1], "current");
  });

  it("waits a row's eye while a write on it is in flight", () => {
    const p = props();
    render(<PanoramaPhaseList {...p} phases={{ ...p.phases, pendingIds: [2] }} />);
    expect(screen.getByRole("button", { name: "Hide panorama Capture 2" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Hide panorama Capture 1" })).not.toHaveAttribute("aria-busy");
  });

  it("folds a phase on its disclosure, but keeps open the one holding the capture the reader is in", async () => {
    const { rerender } = render(<PanoramaPhaseList {...props()} />);
    await userEvent.click(phase("Prior job"));
    expect(phase("Prior job")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Capture 1")).toBeNull();
    rerender(<PanoramaPhaseList {...props({ rows: [row(1, { active: true }), row(2, { phase: "post" })] })} />);
    expect(phase("Prior job")).toHaveAttribute("aria-expanded", "true");
    expect(phase("Prior job")).toHaveAttribute("aria-current", "true");
  });

  it("keeps an empty, hidden list the section head can still point at when folded", () => {
    const { container } = render(<PanoramaPhaseList {...props({ open: false })} />);
    const list = container.querySelector("ul#list")!;
    expect(list).toHaveAttribute("data-tour", "panorama-picker");
    expect(list).not.toBeVisible();
    expect(list).toBeEmptyDOMElement();
  });

  it("nests each phase's captures in a list of their own", () => {
    const { container } = render(<PanoramaPhaseList {...props()} />);
    const prior = phase("Prior job").closest("li")!;
    expect(within(prior).getByRole("button", { name: "Show in this panorama: Capture 1" })).toBeInTheDocument();
    expect(container.querySelectorAll("ul#list > li")).toHaveLength(3);
  });
});
