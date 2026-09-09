import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AuditEntry } from "@/entities/audit";
import { ActivitySection } from "./activity-section";

const entry = (id: number, action: string): AuditEntry => ({
  id,
  at: new Date().toISOString(),
  actorId: "u-1",
  actorLogin: "a.ivanova",
  companyId: "",
  companyLogin: "",
  action,
  entity: "",
  entityId: "",
  entityLabel: "",
  territorySlug: "",
  oldRow: null,
  newRow: null,
  result: "ok",
});

describe("ActivitySection", () => {
  it("answers loading, unavailable, empty and rows differently", () => {
    const { rerender } = render(<ActivitySection entries={null} loading />);
    expect(screen.getByRole("status", { name: "Loading your activity" })).toBeInTheDocument();

    rerender(<ActivitySection entries={null} loading={false} />);
    expect(screen.getByText("Your activity could not be loaded.")).toBeInTheDocument();

    rerender(<ActivitySection entries={[]} loading={false} />);
    expect(screen.getByText("No activity yet")).toBeInTheDocument();

    rerender(
      <ActivitySection entries={[entry(1, "auth.login"), entry(2, "model.create")]} loading={false} />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Open account →" })).toHaveAttribute("href", "/account");
  });

  it("heads the section however it answers", () => {
    render(<ActivitySection entries={[]} loading={false} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Your recent activity" }),
    ).toBeInTheDocument();
    expect(screen.getByText("newest first")).toBeInTheDocument();
  });
});
