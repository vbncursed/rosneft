import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleNav, type ConsoleNavItem } from "./console-nav";

const ITEMS: ConsoleNavItem[] = [
  { key: "users", label: "Users", href: "/admin/users" },
  { key: "roles", label: "Roles & Permissions", href: "/admin/roles" },
  { key: "audit", label: "Audit journal", href: "/admin/audit" },
  { key: "metrics", label: "Metrics", href: "/admin/metrics", disabled: true },
];

describe("ConsoleNav", () => {
  it("is a labelled navigation landmark", () => {
    render(<ConsoleNav items={ITEMS} active="users" backHref="/" />);
    expect(screen.getByRole("navigation", { name: "Console" })).toBeInTheDocument();
  });

  it("marks the open section as the current page", () => {
    render(<ConsoleNav items={ITEMS} active="roles" backHref="/" />);
    expect(screen.getByRole("link", { name: "Roles & Permissions" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Users" })).not.toHaveAttribute("aria-current");
  });

  it("does not link a section the actor may not open", () => {
    render(<ConsoleNav items={ITEMS} active="users" backHref="/" />);
    expect(screen.queryByRole("link", { name: "Metrics" })).not.toBeInTheDocument();
    expect(screen.getByText("Metrics")).toHaveAttribute("aria-disabled", "true");
  });

  it("offers the way back out", () => {
    render(<ConsoleNav items={ITEMS} active="users" backHref="/territories" />);
    expect(screen.getByRole("link", { name: "← Back to site" })).toHaveAttribute(
      "href",
      "/territories",
    );
  });

  it("takes a different label for the way back", () => {
    render(<ConsoleNav items={ITEMS} active="users" backHref="/" backLabel="← Home" />);
    expect(screen.getByRole("link", { name: "← Home" })).toBeInTheDocument();
  });
});
