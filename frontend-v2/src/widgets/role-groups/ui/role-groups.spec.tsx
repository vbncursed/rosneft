import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RoleGroups, type RoleGroup } from "./role-groups";
import type { Role } from "@/entities/role";

const role = (slug: string, title: string, kind: Role["kind"] = "custom"): Role => ({
  slug,
  title,
  kind,
  grants: 6,
  users: 11,
  updated: "upd. 29.08",
});

const GROUPS: RoleGroup[] = [
  {
    key: "system",
    label: "System roles",
    note: "read-only · defined by migrations",
    roles: [{ role: role("root", "Root", "system"), tone: "accent", tag: "owner" }],
  },
  {
    key: "custom",
    label: "Custom roles",
    note: "2 roles · editable",
    roles: [
      { role: role("field-operator", "Field Operator") },
      { role: role("people-roles", "People & Roles Manager") },
    ],
  },
];

describe("RoleGroups", () => {
  it("renders a labelled section per group", () => {
    render(<RoleGroups groups={GROUPS} totalPermissions={15} />);
    expect(screen.getByRole("region", { name: "System roles" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Custom roles" })).toBeInTheDocument();
  });

  it("carries the group's note beside its heading", () => {
    render(<RoleGroups groups={GROUPS} totalPermissions={15} />);
    expect(screen.getByText("read-only · defined by migrations")).toBeInTheDocument();
  });

  it("renders one card per role", () => {
    render(<RoleGroups groups={GROUPS} totalPermissions={15} />);
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("gives every meter the same denominator", () => {
    render(<RoleGroups groups={GROUPS} totalPermissions={15} />);
    expect(screen.getAllByText("6/15")).toHaveLength(3);
  });

  it("marks the selected role", () => {
    render(<RoleGroups groups={GROUPS} totalPermissions={15} selectedSlug="field-operator" />);
    expect(screen.getByRole("article", { name: "Field Operator" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("reports a selection by slug", async () => {
    const onSelect = vi.fn();
    render(<RoleGroups groups={GROUPS} totalPermissions={15} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("article", { name: "Root" }));
    expect(onSelect).toHaveBeenCalledWith("root");
  });

  it("hides a group the filter emptied", () => {
    render(
      <RoleGroups
        groups={[...GROUPS, { key: "x", label: "Archived", roles: [] }]}
        totalPermissions={15}
      />,
    );
    expect(screen.queryByRole("region", { name: "Archived" })).not.toBeInTheDocument();
  });

  it("says the filter matched nothing rather than showing empty headings", () => {
    render(<RoleGroups groups={[{ key: "x", label: "Custom", roles: [] }]} totalPermissions={15} />);
    expect(screen.getByText("No roles match this filter.")).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
