import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "@/entities/audit";
import { ActivitySection } from "./activity-section";

// relativeAt reads the local clock, so both the timezone and "now" are pinned
// — otherwise "today" turns into "yesterday" overnight and the suite goes red
// on its own. See activity.spec.ts for the same pin.
// stubEnv rather than a hand-rolled save/restore — see activity.spec.ts:
// TZ is unset here, and writing `undefined` back leaves the literal string
// "undefined", which pins every later spec in the process to UTC.
beforeAll(() => {
  vi.stubEnv("TZ", "UTC");
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
afterEach(() => vi.setSystemTime(new Date("2026-09-07T12:00:00Z")));

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 1,
  at: "2026-09-07T09:14:00Z",
  actorId: "u-1",
  actorLogin: "a.ivanova",
  companyId: "",
  companyLogin: "",
  action: "auth.login",
  entity: "session",
  entityId: "s-1",
  entityLabel: "",
  territorySlug: "",
  oldRow: null,
  newRow: null,
  result: "ok",
  ...over,
});

const ENTRIES = [
  entry({ id: 9 }),
  entry({
    id: 8,
    at: "2026-09-06T18:20:00Z",
    action: "placement.update",
    entity: "placement",
    entityLabel: "Storage Tank 500",
    territorySlug: "refinery-block-c",
  }),
];

const props = (over: Partial<Parameters<typeof ActivitySection>[0]> = {}) => ({
  entries: ENTRIES,
  hasMore: false,
  busy: false,
  onLoadMore: vi.fn(),
  ...over,
});

describe("ActivitySection", () => {
  it("heads the feed and says what it holds", () => {
    render(<ActivitySection {...props()} />);
    expect(screen.getByRole("heading", { level: 2, name: "My activity" })).toBeInTheDocument();
    expect(screen.getByText("everything recorded under your account, newest first")).toBeInTheDocument();
  });

  it("prints the action verbatim, the summary beneath it and a bare clock for today", () => {
    render(<ActivitySection {...props()} />);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("auth.login")).toBeInTheDocument();
    expect(within(rows[0]).getByText("session")).toBeInTheDocument();
    expect(within(rows[0]).getByText("09:14")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Storage Tank 500 · refinery-block-c")).toBeInTheDocument();
    expect(within(rows[1]).getByText("yesterday 18:20")).toBeInTheDocument();
  });

  it("keeps the order it was handed — the gateway already sorted it newest first", () => {
    render(<ActivitySection {...props()} />);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("auth.login")).toBeInTheDocument();
    expect(within(rows[1]).getByText("placement.update")).toBeInTheDocument();
  });

  it("counts what is on screen", () => {
    render(<ActivitySection {...props()} />);
    expect(screen.getByText("showing 2 events")).toBeInTheDocument();
  });

  // Show more is drawn off the query's own answer, never off a page-size
  // guess: a full last page would otherwise offer a page that does not exist.
  it("offers another page only when the feed reports one", async () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(<ActivitySection {...props({ hasMore: false })} />);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();

    rerender(<ActivitySection {...props({ hasMore: true, onLoadMore })} />);
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("blocks a second request while one is in flight", () => {
    render(<ActivitySection {...props({ hasMore: true, busy: true })} />);
    expect(screen.getByRole("button", { name: "Show more" })).toBeDisabled();
  });

  it("says nothing was recorded, and offers no footer to page through", () => {
    render(<ActivitySection {...props({ entries: [], hasMore: false })} />);
    expect(screen.getByText("Nothing recorded yet")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.queryByText(/showing/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });
});
