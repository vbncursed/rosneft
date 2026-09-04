import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "@/entities/audit";
import type { AuditState } from "../model/use-audit";
import { AuditScreen } from "./audit-screen";

const { useAudit, leaveTo } = vi.hoisted(() => ({ useAudit: vi.fn(), leaveTo: vi.fn() }));
vi.mock("../model/use-audit", () => ({ useAudit }));
vi.mock("@/shared/lib/leave", () => ({ leaveTo }));

const entry = (id: number, over: Partial<AuditEntry> = {}): AuditEntry => ({
  id,
  at: "2026-09-01T09:14:00Z",
  actorId: "u-1",
  actorLogin: "a.ivanova",
  companyId: "c-1",
  companyLogin: "cotest",
  action: "territory.update",
  entity: "territory",
  entityId: "t-1",
  entityLabel: "refinery",
  territorySlug: "",
  oldRow: { role_id: "9b75" },
  newRow: { role_id: "1" },
  result: "ok",
  ...over,
});

const E1 = entry(1);
const E2 = entry(2, { at: "2026-08-31T22:00:00Z" });

const state = (over: Partial<AuditState> = {}): AuditState => ({
  status: "ready",
  error: null,
  entries: [E1, E2],
  refs: { "role_id:1": "Editor" },
  actors: [{ id: "u-1", login: "a.ivanova" }],
  window: { entries: [E1], capped: false },
  query: "",
  setQuery: vi.fn(),
  range: { from: "", to: "" },
  setRange: vi.fn(),
  filters: {},
  unknownActor: null,
  selected: null,
  select: vi.fn(),
  live: false,
  loadingOlder: false,
  exportCsv: vi.fn(),
  exporting: false,
  copyJson: vi.fn(),
  ...over,
});

beforeEach(() => {
  useAudit.mockReset();
  leaveTo.mockReset();
});

describe("AuditScreen", () => {
  it("shows skeletons while loading and the gateway's sentence when unavailable", () => {
    useAudit.mockReturnValue(state({ status: "loading", window: null }));
    const { unmount } = render(<AuditScreen />);
    expect(screen.getByRole("status", { name: "Loading journal" })).toBeInTheDocument();
    unmount();

    useAudit.mockReturnValue(
      state({
        status: "unavailable",
        window: null,
        error: "You don't have permission to do this",
      }),
    );
    render(<AuditScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent("You don't have permission to do this");
  });

  it("groups the journal by day, newest first", () => {
    useAudit.mockReturnValue(state());
    render(<AuditScreen />);
    expect(screen.getByRole("region", { name: /1 September/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /31 August/ })).toBeInTheDocument();
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toHaveLength(2);
  });

  it("shows the live marker only while the journal is following", () => {
    useAudit.mockReturnValue(state());
    const { unmount } = render(<AuditScreen />);
    expect(screen.queryByText("live")).not.toBeInTheDocument();
    unmount();

    useAudit.mockReturnValue(state({ live: true }));
    render(<AuditScreen />);
    expect(screen.getByText("live")).toBeInTheDocument();
  });

  it("names the five keys the gateway filters on in the placeholder", () => {
    useAudit.mockReturnValue(state());
    render(<AuditScreen />);
    expect(screen.getByRole("textbox", { name: "Filter events" })).toHaveAttribute(
      "placeholder",
      "filter: entity:territory action:territory.update actor:a.ivanova from:2026-09-01 to:2026-09-02",
    );
  });

  it("offers a From and a To date field, and picks a day through either calendar", async () => {
    const setRange = vi.fn();
    useAudit.mockReturnValue(state());
    const { unmount } = render(<AuditScreen />);
    expect(screen.getByRole("button", { name: "From" })).toHaveTextContent("yyyy-mm-dd");
    expect(screen.getByRole("button", { name: "To" })).toHaveTextContent("yyyy-mm-dd");
    unmount();

    useAudit.mockReturnValue(
      state({ range: { from: "2026-08-24", to: "2026-08-18" }, setRange }),
    );
    render(<AuditScreen />);
    expect(screen.getByRole("button", { name: "From" })).toHaveTextContent("2026-08-24");

    await userEvent.click(screen.getByRole("button", { name: "From" }));
    await userEvent.click(screen.getByRole("button", { name: "12 August 2026" }));
    expect(setRange).toHaveBeenCalledWith({ from: "2026-08-12", to: "2026-08-18" });

    await userEvent.click(screen.getByRole("button", { name: "To" }));
    await userEvent.click(screen.getByRole("button", { name: "20 August 2026" }));
    expect(setRange).toHaveBeenLastCalledWith({ from: "2026-08-24", to: "2026-08-20" });
  });

  it("words the picked range as one chip, whose × clears both dates", async () => {
    const setRange = vi.fn();
    useAudit.mockReturnValue(
      state({ range: { from: "2026-09-01", to: "2026-09-02" }, setRange }),
    );
    render(<AuditScreen />);
    expect(screen.getByText("1 Sep – 2 Sep")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Remove filter 1 Sep – 2 Sep" }));
    expect(setRange).toHaveBeenCalledWith({ from: "", to: "" });
  });

  it("names an actor nobody has and shows no journal for them", () => {
    useAudit.mockReturnValue(state({ unknownActor: "ghost", entries: [] }));
    render(<AuditScreen />);
    expect(screen.getByText("No actor named ghost.")).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("answers an empty journal with a sentence rather than a blank frame", () => {
    useAudit.mockReturnValue(state({ entries: [] }));
    render(<AuditScreen />);
    expect(screen.getByText("No events match this filter.")).toBeInTheDocument();
  });

  it("opens the inspector on the selected entry, with its facts and refs", () => {
    useAudit.mockReturnValue(state({ selected: E1 }));
    render(<AuditScreen />);
    expect(screen.getByRole("complementary", { name: "Record inspector" })).toBeInTheDocument();
    expect(screen.getByText("Record · 1")).toBeInTheDocument();
    expect(screen.getByText("cotest")).toBeInTheDocument();
    expect(screen.getByText('"9b75" → Editor')).toBeInTheDocument();
  });

  it("closes the inspector by clearing the selection", async () => {
    const select = vi.fn();
    useAudit.mockReturnValue(state({ selected: E1, select }));
    render(<AuditScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(select).toHaveBeenCalledWith(null);
  });

  it("leaves for the entity the record names", async () => {
    useAudit.mockReturnValue(state({ selected: E1 }));
    render(<AuditScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Open entity" }));
    expect(leaveTo).toHaveBeenCalledWith("/territories/refinery");
  });

  it("offers nowhere to open for a deleted entity", () => {
    useAudit.mockReturnValue(state({ selected: entry(3, { action: "territory.delete" }) }));
    render(<AuditScreen />);
    expect(screen.queryByRole("button", { name: "Open entity" })).not.toBeInTheDocument();
  });

  it("exports through the container", async () => {
    const exportCsv = vi.fn();
    useAudit.mockReturnValue(state({ exportCsv }));
    render(<AuditScreen />);
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    expect(exportCsv).toHaveBeenCalledOnce();
  });

  it("offers to load older events only while the container hands a way to", async () => {
    const loadOlder = vi.fn();
    useAudit.mockReturnValue(state());
    const { unmount } = render(<AuditScreen />);
    expect(screen.queryByRole("button", { name: /Load older/ })).not.toBeInTheDocument();
    unmount();

    useAudit.mockReturnValue(state({ loadOlder }));
    render(<AuditScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Load older events" }));
    expect(loadOlder).toHaveBeenCalledOnce();
  });
});
