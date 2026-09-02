import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EventCard } from "./event-card";
import type { AuditEntry } from "../model/audit-entry";

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 1,
  at: "2026-09-01T09:14:22Z",
  actorId: "u-1",
  actorLogin: "a.ivanova",
  action: "territory.update",
  entity: "territory",
  entityId: "t-1",
  entityLabel: "Refinery Block C",
  oldRow: null,
  newRow: null,
  result: "ok",
  ...over,
});

describe("EventCard", () => {
  it("shows the action, the target, the actor and the time", () => {
    render(<EventCard entry={entry()} summary="4 fields changed" />);
    expect(screen.getByText("territory.update")).toBeInTheDocument();
    expect(screen.getByText("Refinery Block C")).toBeInTheDocument();
    expect(screen.getByText("a.ivanova")).toBeInTheDocument();
    expect(screen.getByText("09:14")).toBeInTheDocument();
    expect(screen.getByText("4 fields changed")).toBeInTheDocument();
  });

  it("spells the kind out in the accessible name, not just in the glyph", () => {
    render(<EventCard entry={entry({ action: "placement.create" })} summary="placed" />);
    expect(
      screen.getByRole("article", { name: "placement.create, created Refinery Block C" }),
    ).toBeInTheDocument();
  });

  it("colours the rail and the ring by kind", () => {
    const { container, rerender } = render(
      <EventCard entry={entry({ action: "placement.create" })} summary="s" />,
    );
    expect(container.querySelector("span[aria-hidden]")!.className).toContain("bg-ok");

    rerender(<EventCard entry={entry({ action: "model.delete" })} summary="s" />);
    expect(container.querySelector("span[aria-hidden]")!.className).toContain("bg-bad");

    rerender(<EventCard entry={entry({ action: "auth.login" })} summary="s" />);
    expect(container.querySelector("span[aria-hidden]")!.className).toContain("bg-muted");
  });

  it("draws the operator glyph for each kind", () => {
    const { rerender } = render(<EventCard entry={entry()} summary="s" />);
    expect(screen.getByText("±")).toBeInTheDocument();

    rerender(<EventCard entry={entry({ action: "placement.create" })} summary="s" />);
    expect(screen.getByText("+")).toBeInTheDocument();

    rerender(<EventCard entry={entry({ action: "model.delete" })} summary="s" />);
    expect(screen.getByText("−")).toBeInTheDocument();

    rerender(<EventCard entry={entry({ action: "auth.login" })} summary="s" />);
    expect(screen.getByText("→")).toBeInTheDocument();
  });

  it("flags a failed event, in the name as well as on the card", () => {
    render(<EventCard entry={entry({ result: "failed" })} summary="s" />);
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: /, failed$/ })).toBeInTheDocument();
  });

  it("marks the selected card as current and brightens its rail", () => {
    const { container, rerender } = render(<EventCard entry={entry()} summary="s" />);
    expect(container.querySelector("span[aria-hidden]")!.className).toContain("opacity-55");

    rerender(<EventCard entry={entry()} summary="s" selected />);
    expect(screen.getByRole("article")).toHaveAttribute("aria-current", "true");
    expect(container.querySelector("span[aria-hidden]")!.className).not.toContain("opacity-55");
  });

  it("selects on click", async () => {
    const onSelect = vi.fn();
    render(<EventCard entry={entry()} summary="s" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("article"));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("credits a system actor rather than showing a blank", () => {
    render(<EventCard entry={entry({ actorId: "", actorLogin: "" })} summary="s" />);
    expect(screen.getByText("system")).toBeInTheDocument();
  });
});

describe("EventCard · actor", () => {
  it("shows the actor's avatar beside their name", () => {
    render(<EventCard entry={entry()} summary="s" />);
    expect(screen.getByRole("img", { name: "a.ivanova" })).toBeInTheDocument();
  });

  it("gives a system change no avatar — nobody was behind it", () => {
    render(<EventCard entry={entry({ actorId: "", actorLogin: "" })} summary="s" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("system").className).toContain("italic");
  });

  it("falls back to the actor id when the account is gone", () => {
    render(<EventCard entry={entry({ actorLogin: "" })} summary="s" />);
    expect(screen.getByRole("img", { name: "u-1" })).toBeInTheDocument();
    expect(screen.getByText("u-1")).toBeInTheDocument();
  });
})
