import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuditRow } from "./audit-row";
import type { AuditEntry } from "../model/audit-entry";

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 1,
  at: "2026-08-31T14:02:11Z",
  actorId: "u-1",
  actorLogin: "a.ivanova",
  companyId: "",
  companyLogin: "",
  action: "territory.insert",
  entity: "territory",
  entityId: "t-1",
  entityLabel: "Refinery Block C",
  territorySlug: "",
  oldRow: { position_x: 8.2 },
  newRow: { position_x: 12.4 },
  result: "ok",
  ...over,
});

describe("AuditRow", () => {
  it("shows when, what and who", () => {
    render(<AuditRow entry={entry()} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("2026-08-31 14:02")).toBeInTheDocument();
    expect(screen.getByText("territory.insert")).toBeInTheDocument();
    expect(screen.getByText(/Refinery Block C/)).toBeInTheDocument();
    expect(screen.getByText("a.ivanova")).toBeInTheDocument();
  });

  it("credits a system change rather than showing a blank actor", () => {
    render(
      <AuditRow entry={entry({ actorId: "", actorLogin: "" })} expanded={false} onToggle={() => {}} />,
    );
    expect(screen.getByText("system")).toBeInTheDocument();
  });

  it("flags a failed action", () => {
    const { rerender } = render(<AuditRow entry={entry()} expanded={false} onToggle={() => {}} />);
    expect(screen.queryByText("failed")).not.toBeInTheDocument();

    rerender(<AuditRow entry={entry({ result: "failed" })} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("keeps the diff hidden until asked, and reports that state", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<AuditRow entry={entry()} expanded={false} onToggle={onToggle} />);

    const toggle = screen.getByRole("button", { name: "diff" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("position_x")).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();

    rerender(<AuditRow entry={entry()} expanded onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "diff" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("position_x")).toBeInTheDocument();
  });
});
