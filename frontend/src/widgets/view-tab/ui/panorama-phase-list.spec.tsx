import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ALL_PHASES_SHOWN } from "@/entities/panorama";
import { HIDDEN_NOTE } from "../model/copy";
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
    onMove: vi.fn(async () => true),
    onSetPhaseHidden: vi.fn(),
    justAddedId: null,
    onJustAddedSeen: vi.fn(),
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
    expect(
      screen.getAllByRole("button", { name: /^(Prior|Current|Post) job$/ }).map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Prior job", "Current job", "Post job"]);
    expect(phase("Prior job")).toHaveTextContent("1 panorama");
    expect(phase("Current job")).toHaveTextContent("No panoramas");
  });

  it("starts every phase folded: nothing expanded, no rows mounted", () => {
    render(<PanoramaPhaseList {...props()} />);
    expect(phase("Prior job")).toHaveAttribute("aria-expanded", "false");
    expect(phase("Current job")).toHaveAttribute("aria-expanded", "false");
    expect(phase("Post job")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Capture 1")).toBeNull();
    expect(screen.queryByText("Capture 2")).toBeNull();
  });

  it("expands only the phase holding the capture the reader stands in or edits, on mount", () => {
    render(<PanoramaPhaseList {...props({ rows: [row(1, { active: true }), row(2, { phase: "post" })] })} />);
    expect(phase("Prior job")).toHaveAttribute("aria-expanded", "true");
    expect(phase("Post job")).toHaveAttribute("aria-expanded", "false");
  });

  it("gives a reader only phases with something shown, and no eye or move anywhere", () => {
    const p = props({ rows: [row(1, { canEdit: false })] });
    render(<PanoramaPhaseList {...p} phases={{ ...p.phases, canWrite: false }} />);
    expect(screen.getAllByRole("button", { name: /job$/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Hide/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Move/ })).toBeNull();
  });

  it("toggles a phase's own flag from its eye", async () => {
    const p = props();
    render(<PanoramaPhaseList {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Hide phase Current job" }));
    expect(p.phases.onSetPhaseHidden).toHaveBeenCalledWith("current", true);
  });

  it("reads a hidden phase as pressed, says so in its line, and dims its rows", async () => {
    const p = props();
    render(<PanoramaPhaseList {...p} phases={{ ...p.phases, hidden: { ...ALL_PHASES_SHOWN, post: true } }} />);
    expect(screen.getByRole("button", { name: "Hide phase Post job" })).toHaveAttribute("aria-pressed", "true");
    expect(phase("Post job")).toHaveTextContent("1 panorama · hidden");
    await userEvent.click(phase("Prior job"));
    await userEvent.click(phase("Post job"));
    expect(within(screen.getByText("Capture 2").closest("li")!).getByText(HIDDEN_NOTE)).toBeInTheDocument();
    expect(within(screen.getByText("Capture 1").closest("li")!).queryByText(HIDDEN_NOTE)).toBeNull();
  });

  it("waits a phase's eye while its write is in flight", () => {
    const p = props();
    render(<PanoramaPhaseList {...p} phases={{ ...p.phases, pendingPhases: ["prior"] }} />);
    expect(screen.getByRole("button", { name: "Hide phase Prior job" })).toHaveAttribute("aria-busy", "true");
  });

  it("hides one row from its own eye, and moves it to another phase", async () => {
    const p = props();
    render(<PanoramaPhaseList {...p} />);
    await userEvent.click(phase("Prior job"));
    await userEvent.click(screen.getByRole("button", { name: "Hide panorama Capture 1" }));
    expect(p.phases.onSetHidden).toHaveBeenCalledWith([1], true);
    await userEvent.click(screen.getByRole("button", { name: "Move Capture 1 to another phase" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Current job" }));
    expect(p.phases.onMove).toHaveBeenCalledWith([1], "current");
  });

  it("waits a row's eye while a write on it is in flight", async () => {
    const p = props();
    render(<PanoramaPhaseList {...p} phases={{ ...p.phases, pendingIds: [2] }} />);
    await userEvent.click(phase("Prior job"));
    await userEvent.click(phase("Post job"));
    expect(screen.getByRole("button", { name: "Hide panorama Capture 2" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Hide panorama Capture 1" })).not.toHaveAttribute("aria-busy");
  });

  it("folds a phase on its disclosure, but keeps open the one holding the capture the reader is in", async () => {
    const { rerender } = render(<PanoramaPhaseList {...props()} />);
    await userEvent.click(phase("Prior job"));
    expect(phase("Prior job")).toHaveAttribute("aria-expanded", "true");
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

  it("nests each phase's captures in a list of their own", async () => {
    const { container } = render(<PanoramaPhaseList {...props()} />);
    await userEvent.click(phase("Prior job"));
    const prior = phase("Prior job").closest("li")!;
    expect(within(prior).getByRole("button", { name: "Show in this panorama: Capture 1" })).toBeInTheDocument();
    expect(container.querySelectorAll("ul#list > li")).toHaveLength(3);
  });

  // The row leaves its phase's <ul> once the move lands, taking the Move
  // trigger that held focus with it (Menu already returned focus there before
  // calling onSelect). The destination's disclosure is the one control that
  // never unmounts, so it is where focus goes next.
  it("sends focus to the destination phase's disclosure once a move lands", async () => {
    const onMove = vi.fn(async () => true);
    const p = props();
    render(<PanoramaPhaseList {...p} phases={{ ...p.phases, onMove }} />);
    await userEvent.click(phase("Prior job"));
    await userEvent.click(screen.getByRole("button", { name: "Move Capture 1 to another phase" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Current job" }));
    await waitFor(() => expect(document.activeElement).toBe(phase("Current job")));
  });

  it("leaves focus on the trigger when a move is refused", async () => {
    const onMove = vi.fn(async () => false);
    const p = props();
    render(<PanoramaPhaseList {...p} phases={{ ...p.phases, onMove }} />);
    await userEvent.click(phase("Prior job"));
    const trigger = screen.getByRole("button", { name: "Move Capture 1 to another phase" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Current job" }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("expands the phase a freshly uploaded capture landed in", () => {
    const p = props();
    const { rerender } = render(<PanoramaPhaseList {...p} />);
    expect(phase("Post job")).toHaveAttribute("aria-expanded", "false");
    rerender(<PanoramaPhaseList {...p} phases={{ ...p.phases, justAddedId: 2 }} />);
    expect(phase("Post job")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Capture 2")).toBeInTheDocument();
  });

  it("still folds normally after an upload opened its phase", async () => {
    const p = props();
    render(<PanoramaPhaseList {...p} phases={{ ...p.phases, justAddedId: 2 }} />);
    expect(phase("Post job")).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(phase("Post job"));
    expect(phase("Post job")).toHaveAttribute("aria-expanded", "false");
  });

  // Important review fix: the widget must tell the page it has consumed a
  // justAddedId, so the page's source of truth can go back to null — a
  // PanoramaPhaseList remount (switching to Placements and back) resets this
  // component's own state, but not the page's, so without an ack the same id
  // reopens a phase the reader had just folded again.
  it("acknowledges a just-added id once it has opened the phase", () => {
    const onJustAddedSeen = vi.fn();
    const p = props();
    render(<PanoramaPhaseList {...p} phases={{ ...p.phases, justAddedId: 2, onJustAddedSeen }} />);
    expect(onJustAddedSeen).toHaveBeenCalledTimes(1);
  });

  it("a remount that outlives the upload does not reopen a phase the reader folded, once the id was acknowledged", async () => {
    // A small stand-in for the real page: it owns justAddedId exactly like
    // useViewerPanoramas does, and clears it the moment the list acknowledges
    // it. The list itself is unmounted and remounted, as `overlays-panel`
    // does when the reader switches to Placements and back.
    function Harness() {
      const [justAddedId, setJustAddedId] = useState<number | null>(2);
      const [mounted, setMounted] = useState(true);
      const p = props();
      return (
        <>
          <button type="button" onClick={() => setMounted((m) => !m)}>
            toggle tab
          </button>
          {mounted ? (
            <PanoramaPhaseList
              {...p}
              phases={{ ...p.phases, justAddedId, onJustAddedSeen: () => setJustAddedId(null) }}
            />
          ) : null}
        </>
      );
    }
    render(<Harness />);
    expect(phase("Post job")).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(phase("Post job"));
    expect(phase("Post job")).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(screen.getByRole("button", { name: "toggle tab" }));
    await userEvent.click(screen.getByRole("button", { name: "toggle tab" }));
    expect(phase("Post job")).toHaveAttribute("aria-expanded", "false");
  });
});
