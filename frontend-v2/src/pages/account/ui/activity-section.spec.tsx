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
  page: 1,
  pageCount: 1,
  summary: "1–2 of 2 events",
  busy: false,
  onPage: vi.fn(),
  ...over,
});

describe("ActivitySection", () => {
  it("heads the feed and says what it holds", () => {
    render(<ActivitySection {...props()} />);
    expect(screen.getByRole("heading", { level: 2, name: "My activity" })).toBeInTheDocument();
    expect(screen.getByText("newest first · 6 per page")).toBeInTheDocument();
  });

  it("prints the action verbatim, the summary beneath it and a bare clock for today", () => {
    render(<ActivitySection {...props()} />);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("auth.login")).toBeInTheDocument();
    expect(within(rows[0]).getByText("09:14")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Storage Tank 500 · refinery-block-c")).toBeInTheDocument();
    expect(within(rows[1]).getByText("yesterday 18:20")).toBeInTheDocument();
  });

  // The shape every auth.* row really has: entity "session", nothing else
  // filled in. A second line reading "session" is a table name, and the feed
  // is mostly these rows.
  it("draws no second line for a row that carries nothing to say", () => {
    render(<ActivitySection {...props({ entries: [entry({ id: 9 })] })} />);
    const [row] = screen.getAllByRole("listitem");
    expect(within(row!).getByText("auth.login")).toBeInTheDocument();
    expect(within(row!).queryByText("session")).not.toBeInTheDocument();
    expect(within(row!).getAllByText(/./, { selector: "p" })).toHaveLength(1);
  });

  it("keeps the second line when the row failed", () => {
    render(
      <ActivitySection
        {...props({
          entries: [entry({ id: 9, action: "auth.password_change", result: "failed" })],
        })}
      />,
    );
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("keeps the order it was handed — the gateway already sorted it newest first", () => {
    render(<ActivitySection {...props()} />);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("auth.login")).toBeInTheDocument();
    expect(within(rows[1]).getByText("placement.update")).toBeInTheDocument();
  });

  it("prints the summary and the pager under the rows", () => {
    render(<ActivitySection {...props({ page: 1, pageCount: 31, summary: "1–6 of 184 events" })} />);
    expect(screen.getByText("1–6 of 184 events")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
  });

  it("hands a page click up", async () => {
    const onPage = vi.fn();
    render(<ActivitySection {...props({ pageCount: 3, onPage })} />);
    await userEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  // A page still on the wire is not an empty history: the rows it will fill
  // are drawn as skeletons and the pager waits rather than taking a second
  // click for a page already on its way.
  it("waits with the pager disabled and skeleton rows while a page is on its way", () => {
    render(<ActivitySection {...props({ entries: [], busy: true, pageCount: 3, page: 3 })} />);
    const waiting = screen.getByRole("status", { name: "Loading page 3" });
    // One line per row the page will hold, so the footer does not jump when
    // the rows land under it mid-walk.
    expect(waiting.querySelectorAll("span[aria-hidden='true']")).toHaveLength(6);
    expect(screen.queryByText("Nothing to show yet")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  // A cursor page that never arrived leaves an empty slice over a journal that
  // is demonstrably not empty — "Nothing to show yet" is a wrong answer about
  // the reader's own history, and without the footer there is no way back to
  // the page that did load.
  it("says the page failed rather than reporting an empty journal, and keeps the pager", () => {
    render(<ActivitySection {...props({ entries: [], busy: false, page: 4, pageCount: 10 })} />);
    expect(screen.getByText("This page could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText("Nothing to show yet")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prev" })).toBeEnabled();
  });

  it("says nothing was recorded, and draws no pager", () => {
    render(<ActivitySection {...props({ entries: [], busy: false, pageCount: 1 })} />);
    expect(screen.getByText("Nothing to show yet")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Pages" })).not.toBeInTheDocument();
  });

  // The reader has just signed in and auth.login is journalled, so an empty
  // state promising that signing in "shows up here" contradicts itself in
  // front of the person reading it.
  it("does not promise the reader an event the feed has already failed to show", () => {
    render(<ActivitySection {...props({ entries: [] })} />);
    expect(screen.queryByText(/Signing in/)).not.toBeInTheDocument();
  });

  // A 403 — which is what every Guest gets — must not read as "nothing ever
  // happened". Both sibling sections on this page carry the same callout.
  it("says the feed could not be loaded rather than reporting an empty history", () => {
    render(<ActivitySection {...props({ entries: null })} />);
    expect(screen.getByText("Your activity could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText("Nothing to show yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Pages" })).not.toBeInTheDocument();
  });
});
