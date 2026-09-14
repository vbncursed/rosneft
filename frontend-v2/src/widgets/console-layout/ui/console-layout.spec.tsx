import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleLayout } from "./console-layout";
import type { ConsoleNavItem } from "@/widgets/console-nav";

const ITEMS: ConsoleNavItem[] = [
  { key: "users", label: "Users", href: "/admin/users" },
  { key: "roles", label: "Roles & Permissions", href: "/admin/roles" },
];

const viewer = { username: "a.ivanova", roleTitle: "Company Owner" };

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false } as MediaQueryList));
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

const layout = (over = {}) =>
  render(
    <ConsoleLayout items={ITEMS} active="users" backHref="/" viewer={viewer} {...over}>
      <h1>Users</h1>
    </ConsoleLayout>,
  );

describe("ConsoleLayout", () => {
  it("puts the page's content in the main region", () => {
    layout();
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("heading", { name: "Users" }),
    );
  });

  it("carries the navigation column", () => {
    layout();
    expect(screen.getByRole("navigation", { name: "Console" })).toBeInTheDocument();
    expect(screen.getByText("a.ivanova")).toBeInTheDocument();
  });

  it("marks the section the route belongs to", () => {
    layout({ active: "roles" });
    expect(screen.getByRole("link", { name: "Roles & Permissions" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Users" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the sidebar out of the main region, so a page cannot nest chrome", () => {
    layout();
    expect(screen.getByRole("main")).not.toContainElement(
      screen.getByRole("navigation", { name: "Console" }),
    );
  });

  it("renders exactly one main region", () => {
    layout();
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });
});
