import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuditPage, type AuditPageProps } from "./audit-page";
import type { AuditEntry } from "@/entities/audit";

const entry = (id: number, action: string, label: string, over: Partial<AuditEntry> = {}): AuditEntry => ({
  id,
  at: "2026-09-01T09:14:00Z",
  actorId: "u-1",
  actorLogin: "a.ivanova",
  companyId: "",
  companyLogin: "",
  action,
  entity: action.split(".")[0],
  entityId: `e-${id}`,
  entityLabel: label,
  territorySlug: "",
  oldRow: { title: "Refinery Block" },
  newRow: { title: "Refinery Block C" },
  result: "ok",
  ...over,
});

const props = (over: Partial<AuditPageProps> = {}): AuditPageProps => ({
  days: [
    {
      key: "today",
      label: "Today · 1 September",
      total: 312,
      events: [
        { entry: entry(1, "territory.update", "Refinery Block C"), summary: "4 fields changed" },
        { entry: entry(2, "placement.insert", "Storage Tank 500"), summary: "placed" },
      ],
    },
    {
      key: "yesterday",
      label: "Yesterday · 31 August",
      total: 268,
      events: [{ entry: entry(3, "model.insert", "Flare Stack", { result: "failed" }), summary: "parse error" }],
    },
  ],
  activity: { values: [4, 12, 52, 9], label: "Events · last 24h", detail: "peak 41/h at 14:00" },
  counters: [
    { label: "Today", value: "312" },
    { label: "Failed", value: "4", tone: "bad" },
    { label: "Actors", value: "9", tone: "accent" },
  ],
  query: "",
  onQueryChange: vi.fn(),
  selectedId: null,
  onSelect: vi.fn(),
  onCloseInspector: vi.fn(),
  onExport: vi.fn(),
  onCopyJson: vi.fn(),
  ...over,
});

describe("AuditPage", () => {
  it("names the journal with one h1", () => {
    render(<AuditPage {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Audit journal" })).toBeInTheDocument();
    expect(screen.getByText("Append-only · tamper-evident")).toBeInTheDocument();
  });

  it("draws no chrome of its own — the layout owns the column", () => {
    render(<AuditPage {...props()} />);
    expect(screen.queryByRole("navigation", { name: "Console" })).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("shows the live marker only while it is following new events", () => {
    const { rerender } = render(<AuditPage {...props()} />);
    expect(screen.queryByText("live")).not.toBeInTheDocument();

    rerender(<AuditPage {...props({ live: true })} />);
    expect(screen.getByText("live")).toBeInTheDocument();
  });

  it("exports, and blocks a second export while one is running", async () => {
    const onExport = vi.fn();
    const { rerender } = render(<AuditPage {...props({ onExport })} />);
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    expect(onExport).toHaveBeenCalledOnce();

    rerender(<AuditPage {...props({ onExport, exporting: true })} />);
    const button = screen.getByRole("button", { name: /Export/ });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onExport).toHaveBeenCalledOnce();
  });

  it("refuses to export what the screen is not showing", async () => {
    const onExport = vi.fn();
    render(<AuditPage {...props({ onExport, exportDisabled: true })} />);
    const button = screen.getByRole("button", { name: /Export/ });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onExport).not.toHaveBeenCalled();
  });

  it("names the five keys the gateway filters on", () => {
    render(<AuditPage {...props()} />);
    expect(screen.getByRole("textbox", { name: "Filter events" })).toHaveAttribute(
      "placeholder",
      "filter: entity:territory action:territory.update actor:a.ivanova from:2026-09-01 to:2026-09-02",
    );
  });

  it("summarises the activity above the journal", () => {
    render(<AuditPage {...props()} />);
    expect(screen.getByRole("img", { name: /Events · last 24h/ })).toBeInTheDocument();
    expect(screen.getByText("peak 41/h at 14:00")).toBeInTheDocument();
    expect(screen.getByLabelText("Failed: 4").className).toContain("text-bad");
  });

  it("groups the events by day", () => {
    render(<AuditPage {...props()} />);
    expect(screen.getByRole("region", { name: "Today · 1 September" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Yesterday · 31 August" })).toBeInTheDocument();
    expect(screen.getByText("312 events")).toBeInTheDocument();
  });

  it("selects a record from the journal", async () => {
    const onSelect = vi.fn();
    render(<AuditPage {...props({ onSelect })} />);
    await userEvent.click(screen.getAllByRole("article")[1]);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("carries chips the query does not own", async () => {
    const onRemove = vi.fn();
    render(<AuditPage {...props({ extraFilters: [{ label: "last 7 days", onRemove }] })} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove filter last 7 days" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("keeps the inspector out of the tree until a record is open", () => {
    render(<AuditPage {...props({ selectedId: 1, inspected: null })} />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("opens the inspector with the record's id and facts", () => {
    render(
      <AuditPage
        {...props({
          selectedId: 1,
          inspected: {
            entry: entry(1, "territory.update", "Refinery Block C"),
            recordId: "4f21c8",
            details: [{ label: "ip", value: "10.42.0.18" }],
          },
        })}
      />,
    );
    expect(screen.getByRole("complementary", { name: "Record inspector" })).toBeInTheDocument();
    expect(screen.getByText("Record · 4f21c8")).toBeInTheDocument();
    expect(screen.getByText("10.42.0.18")).toBeInTheDocument();
    expect(screen.getByText("Changed fields · 1")).toBeInTheDocument();
  });

  it("names the ids inside a diff through the refs it was handed", () => {
    render(
      <AuditPage
        {...props({
          selectedId: 1,
          inspected: {
            entry: entry(1, "user_role.update", "guest.viewer", {
              oldRow: { role_id: "9b75" },
              newRow: { role_id: "1" },
            }),
            recordId: "1",
            details: [],
            refs: { "role_id:1": "Editor" },
          },
        })}
      />,
    );
    expect(screen.getByText('"9b75" → Editor')).toBeInTheDocument();
  });

  it("closes the inspector from its header", async () => {
    const onCloseInspector = vi.fn();
    render(
      <AuditPage
        {...props({
          onCloseInspector,
          selectedId: 1,
          inspected: {
            entry: entry(1, "territory.update", "Refinery Block C"),
            recordId: "4f21c8",
            details: [],
          },
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCloseInspector).toHaveBeenCalledOnce();
  });

  it("offers to load older events only while there are more", async () => {
    const onLoadOlder = vi.fn();
    const { rerender } = render(<AuditPage {...props()} />);
    expect(screen.queryByRole("button", { name: /Load older/ })).not.toBeInTheDocument();

    rerender(<AuditPage {...props({ onLoadOlder })} />);
    await userEvent.click(screen.getByRole("button", { name: "Load older events" }));
    expect(onLoadOlder).toHaveBeenCalledOnce();
  });

  it("blocks a second request while one is in flight", async () => {
    const onLoadOlder = vi.fn();
    render(<AuditPage {...props({ onLoadOlder, loadingOlder: true })} />);
    const button = screen.getByRole("button", { name: /Load older events/ });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onLoadOlder).not.toHaveBeenCalled();
  });
});
