import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AuditEntry } from "../model/audit-entry";
import { ActivityRow } from "./activity-row";

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 1,
  at: "2026-09-08T09:14:00Z",
  actorId: "u-1",
  actorLogin: "me",
  companyId: "",
  companyLogin: "",
  action: "auth.login",
  entity: "session",
  entityId: "",
  entityLabel: "",
  territorySlug: "",
  oldRow: null,
  newRow: null,
  result: "ok",
  ...over,
});
const NOW = new Date("2026-09-08T12:00:00Z");

describe("ActivityRow", () => {
  it("prints the action and the relative time", () => {
    render(
      <ul>
        <ActivityRow entry={entry()} now={NOW} />
      </ul>,
    );
    expect(screen.getByRole("listitem")).toHaveTextContent("auth.login");
    expect(screen.getByText(/\d\d:\d\d/)).toBeInTheDocument();
  });

  it("adds the summary line only when the row has one", () => {
    const { rerender } = render(
      <ul>
        <ActivityRow entry={entry()} now={NOW} />
      </ul>,
    );
    expect(screen.getByRole("listitem").querySelectorAll("p")).toHaveLength(1);
    rerender(
      <ul>
        <ActivityRow
          entry={entry({
            action: "placement.update",
            entityLabel: "Pump Jack Unit",
            territorySlug: "north-ridge-pad",
          })}
          now={NOW}
        />
      </ul>,
    );
    expect(screen.getByText("Pump Jack Unit · north-ridge-pad")).toBeInTheDocument();
  });

  // The one deliberate class assertion: the row owns no padding, so a caller
  // that sets none gets none, and the account feed and Home can space theirs
  // differently.
  it("takes its padding from the caller", () => {
    render(
      <ul>
        <ActivityRow entry={entry()} now={NOW} className="px-[17px] py-[13px]" />
      </ul>,
    );
    expect(screen.getByRole("listitem").className).toContain("px-[17px]");
  });
});
