import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EventTimeline } from "./event-timeline";
import type { AuditEntry } from "@/entities/audit";

const entry = (id: number, action: string, label: string): AuditEntry => ({
  id,
  at: "2026-09-01T09:14:00Z",
  actorId: "u-1",
  actorLogin: "a.ivanova",
  companyId: "",
  companyLogin: "",
  action,
  entity: "territory",
  entityId: `t-${id}`,
  entityLabel: label,
  territorySlug: "",
  oldRow: null,
  newRow: null,
  result: "ok",
});

const EVENTS = [
  { entry: entry(1, "territory.update", "Refinery Block C"), summary: "4 fields changed" },
  { entry: entry(2, "placement.insert", "Storage Tank 500"), summary: "placed at 12.4 / 0.0 / −3.1" },
];

describe("EventTimeline", () => {
  it("is a section named after its day", () => {
    render(<EventTimeline day="Today · 1 September" events={EVENTS} />);
    expect(screen.getByRole("region", { name: "Today · 1 September" })).toBeInTheDocument();
  });

  it("counts the day's events when a total is known", () => {
    const { rerender } = render(<EventTimeline day="Today" events={EVENTS} total={312} />);
    expect(screen.getByText("312 events")).toBeInTheDocument();

    rerender(<EventTimeline day="Today" events={EVENTS} />);
    expect(screen.queryByText(/events$/)).not.toBeInTheDocument();
  });

  it("renders one card per event", () => {
    render(<EventTimeline day="Today" events={EVENTS} />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByText("4 fields changed")).toBeInTheDocument();
  });

  it("says a quiet day is quiet rather than showing a blank", () => {
    render(<EventTimeline day="Sunday" events={[]} />);
    expect(screen.getByText("Nothing happened on this day.")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("marks the selected event", () => {
    render(<EventTimeline day="Today" events={EVENTS} selectedId={2} />);
    const cards = screen.getAllByRole("article");
    expect(cards[1]).toHaveAttribute("aria-current", "true");
    expect(cards[0]).not.toHaveAttribute("aria-current");
  });

  it("reports a selection by id", async () => {
    const onSelect = vi.fn();
    render(<EventTimeline day="Today" events={EVENTS} onSelect={onSelect} />);
    await userEvent.click(screen.getAllByRole("article")[1]);
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
