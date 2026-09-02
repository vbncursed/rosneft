import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PeopleGroups, type PeopleGroup } from "./people-groups";
import type { User } from "@/entities/user";

const user = (id: string, username: string): User => ({
  id,
  username,
  email: `${username}@example.com`,
  status: "active",
  totpEnabled: true,
  passkeyEnabled: true,
  roleSlugs: ["guest"],
  roleTitles: { guest: "guest" },
  isOwner: false,
});

const person = (id: string, username: string) => ({
  user: user(id, username),
  territories: "3 territories",
  lastSeen: "today 09:14",
});

const GROUPS: PeopleGroup[] = [
  { key: "admins", label: "Owners & admins", people: [person("u-1", "a.ivanova")], total: 3 },
  {
    key: "ops",
    label: "Field operators",
    people: [person("u-2", "d.smirnov"), person("u-3", "k.petrov")],
    total: 11,
  },
];

describe("PeopleGroups", () => {
  it("renders a labelled section per group", () => {
    render(<PeopleGroups groups={GROUPS} />);
    expect(screen.getByRole("region", { name: "Owners & admins" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Field operators" })).toBeInTheDocument();
  });

  it("counts the whole group, not just what is loaded", () => {
    render(<PeopleGroups groups={GROUPS} />);
    expect(screen.getByText("11 people")).toBeInTheDocument();
  });

  it("falls back to the loaded count when no total is known", () => {
    render(<PeopleGroups groups={[{ key: "g", label: "Guests", people: [person("u-9", "g.one")] }]} />);
    expect(screen.getByText("1 person")).toBeInTheDocument();
  });

  it("renders one card per person", () => {
    render(<PeopleGroups groups={GROUPS} />);
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("marks the selected person", () => {
    render(<PeopleGroups groups={GROUPS} selectedId="u-2" />);
    expect(screen.getByRole("article", { name: "d.smirnov" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("reports a selection by id", async () => {
    const onSelect = vi.fn();
    render(<PeopleGroups groups={GROUPS} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("article", { name: "k.petrov" }));
    expect(onSelect).toHaveBeenCalledWith("u-3");
  });

  it("hides a group the filter emptied", () => {
    render(<PeopleGroups groups={[...GROUPS, { key: "x", label: "Guests", people: [] }]} />);
    expect(screen.queryByRole("region", { name: "Guests" })).not.toBeInTheDocument();
  });

  it("says the filter matched nobody rather than showing empty headings", () => {
    render(<PeopleGroups groups={[{ key: "x", label: "Guests", people: [] }]} />);
    expect(screen.getByText("No one matches this filter.")).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("takes a caller's wording for the empty case", () => {
    render(<PeopleGroups groups={[]} emptyHint="No accounts yet." />);
    expect(screen.getByText("No accounts yet.")).toBeInTheDocument();
  });
});
