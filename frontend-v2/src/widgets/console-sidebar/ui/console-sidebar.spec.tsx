import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleSidebar } from "./console-sidebar";
import type { ConsoleNavItem } from "@/widgets/console-nav";

const ITEMS: ConsoleNavItem[] = [
  { key: "users", label: "Users", href: "/admin/users" },
  { key: "roles", label: "Roles & Permissions", href: "/admin/roles" },
  { key: "metrics", label: "Metrics", href: "/admin/metrics", disabled: true },
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

const sidebar = (over = {}) =>
  render(<ConsoleSidebar items={ITEMS} active="users" backHref="/" viewer={viewer} {...over} />);

describe("ConsoleSidebar", () => {
  it("carries the navigation, with the open section marked", () => {
    sidebar();
    expect(screen.getByRole("navigation", { name: "Console" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
  });

  it("offers the way back to the site", () => {
    sidebar({ backHref: "/territories" });
    expect(screen.getByRole("link", { name: "← Back to site" })).toHaveAttribute(
      "href",
      "/territories",
    );
  });

  it("names the signed-in viewer and their role", () => {
    sidebar();
    expect(screen.getByText("a.ivanova")).toBeInTheDocument();
    expect(screen.getByText("Company Owner")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "a.ivanova" })).toBeInTheDocument();
  });

  it("hosts the theme control", () => {
    sidebar();
    expect(screen.getByRole("button", { name: /^Theme:/ })).toBeInTheDocument();
  });

  it("keeps the brand mark out of the accessible name — it is decoration", () => {
    const { container } = sidebar({ mark: "A" });
    expect(container.querySelector("span[aria-hidden]")).toHaveTextContent("A");
  });

  it("stands the height of the viewport and stays put while the page scrolls", () => {
    const { container } = sidebar();
    const column = container.firstElementChild!.className;
    expect(column).toContain("sticky");
    expect(column).toContain("h-dvh");
    // Without self-start the grid cell stretches to the row and the sticky
    // has nothing left to stick to.
    expect(column).toContain("self-start");
  });

  it("scrolls only its navigation, keeping the brand and the identity in place", () => {
    sidebar();
    expect(screen.getByRole("navigation", { name: "Console" }).className).toContain(
      "overflow-y-auto",
    );
  });

  it("is not a complementary region — the nav inside is the landmark", () => {
    sidebar();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Console" })).toBeInTheDocument();
  });
});
