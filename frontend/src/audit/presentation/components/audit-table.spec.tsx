// Run with: yarn test:spa  (vitest + jsdom).
//
// cleanup is wired by hand: vitest runs without `globals`, so testing-library
// cannot register its own afterEach hook.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// EntityLink renders a router Link, which needs a live router context. The
// table's behaviour is what is under test, not routing, so the link degrades to
// a plain anchor here.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

import AuditTable from "./audit-table";
import type { AuditEntry } from "@/audit/domain/audit-entry";

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 1,
  at: "2026-07-28T14:02:00Z",
  actorId: "288094d3-0d12-47f8-8833-cc940a080b62",
  actorLogin: "vbncursed",
  companyId: "company-1",
  companyLogin: "vbncursed1",
  action: "territory.update",
  entity: "territory",
  entityId: "7",
  entityLabel: "severnoe-pole",
  oldRow: { title: "Severnoe pole" },
  newRow: { title: "Severnoe pole 2" },
  territorySlug: "",
  result: "ok",
  ...over,
});

afterEach(cleanup);

describe("AuditTable", () => {
  it("shows the entity label and action of each entry", () => {
    render(<AuditTable entries={[entry()]} />);

    expect(screen.getByText("severnoe-pole")).toBeTruthy();
    expect(screen.getByText("territory.update")).toBeTruthy();
  });

  // A system change has no actor. The row must still read, not blank out.
  it("labels an entry with no actor as a system change", () => {
    render(<AuditTable entries={[entry({ actorId: "" })]} />);

    expect(screen.getByText("system")).toBeTruthy();
  });

  it("shows an empty state when there is nothing to show", () => {
    render(<AuditTable entries={[]} />);

    expect(screen.getByText(/no entries yet/i)).toBeTruthy();
  });

  it("reveals both sides of a changed field on demand", async () => {
    render(<AuditTable entries={[entry()]} />);
    expect(screen.queryByText("Severnoe pole 2")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /diff/i }));

    expect(screen.getByText("Severnoe pole 2")).toBeTruthy();
    expect(screen.getByText("title")).toBeTruthy();
  });

  // Session events carry no snapshots — a toggle opening onto nothing would be
  // a dead control.
  it("offers no diff toggle for an entry without snapshots", () => {
    render(<AuditTable entries={[entry({ oldRow: null, newRow: null, action: "auth.login" })]} />);

    expect(screen.queryByRole("button", { name: /diff/i })).toBeNull();
  });

  it("marks a failed entry", () => {
    render(<AuditTable entries={[entry({ result: "failed", action: "auth.login" })]} />);

    expect(screen.getByText("failed")).toBeTruthy();
  });

  const ROLE_UUID = "9b75ebfc-141b-448e-ad63-97fe7ca6fa47";

  it("names an id inside the diff and keeps a shortened id beside it", async () => {
    render(
      <AuditTable
        entries={[
          entry({
            entity: "user_role",
            action: "user_role.create",
            oldRow: null,
            newRow: { user_id: "u-1", role_id: ROLE_UUID },
          }),
        ]}
        refs={{ [`role_id:${ROLE_UUID}`]: "Редактор" }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /diff/i }));

    expect(screen.getByText("Редактор ·9b75ebfc")).toBeTruthy();
    // Полный uuid больше не занимает строку целиком.
    expect(screen.queryByText(ROLE_UUID)).toBeNull();
  });

  // Подписи может не быть: роль удалили, либо сервис подписей был недоступен.
  // Тогда показывается сам id — ровно то, что показывалось до словаря.
  it("falls back to the raw id when nothing named it", async () => {
    render(
      <AuditTable
        entries={[entry({ entity: "user_role", oldRow: null, newRow: { role_id: "r-unknown" } })]}
        refs={{}}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /diff/i }));

    expect(screen.getByText("r-unknown")).toBeTruthy();
  });

  it("names every element of an id array", async () => {
    render(
      <AuditTable
        entries={[
          entry({
            entity: "placement",
            oldRow: null,
            newRow: { visible_panorama_ids: [2, 5] },
          }),
        ]}
        refs={{ "visible_panorama_ids:2": "vhod", "visible_panorama_ids:5": "cex-2" }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /diff/i }));

    expect(screen.getByText("[vhod ·2, cex-2 ·5]")).toBeTruthy();
  });
});
