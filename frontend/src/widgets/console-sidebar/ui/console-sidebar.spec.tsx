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

  it("links the identity block to the account page — the only way into it", () => {
    sidebar();
    const link = screen.getByRole("link", { name: "Account settings for a.ivanova" });
    expect(link).toHaveAttribute("href", "/account");
    expect(link).toHaveTextContent("a.ivanova");
    expect(link).toHaveTextContent("Company Owner");
  });

  // Without an explicit name, the avatar's own aria-label leaks into the
  // link's accessible name and doubles the username: "a.ivanova a.ivanova
  // Company Owner". Measured, not guessed.
  it("names the link once, not the avatar's label doubled with the visible text", () => {
    sidebar();
    const link = screen.getByRole("link", { name: "Account settings for a.ivanova" });
    expect(link).toHaveAccessibleName("Account settings for a.ivanova");
  });

  it("carries a visible focus ring with room to breathe", () => {
    sidebar();
    const link = screen.getByRole("link", { name: "Account settings for a.ivanova" });
    expect(link.className).toContain("outline-offset-2");
  });

  it("hosts the theme control", () => {
    sidebar();
    expect(screen.getByRole("button", { name: /^Theme:/ })).toBeInTheDocument();
  });

  it("keeps the brand mark out of the accessible name — it is decoration", () => {
    const { container } = sidebar({ mark: "A" });
    expect(container.querySelector("span[aria-hidden]")).toHaveTextContent("A");
  });

  it("fills the column for the whole height of the page", () => {
    const { container } = sidebar();
    const column = container.firstElementChild as HTMLElement;
    // A plain grid item: it stretches to the row, so the panel fill and the
    // right border reach the bottom of a long page.
    expect(column).toHaveClass("bg-panel", "lg:border-r");
    expect(column.className).not.toContain("h-dvh");
  });

  it("holds its contents in place while the page scrolls past", () => {
    const { container } = sidebar();
    const inner = container.firstElementChild!.firstElementChild as HTMLElement;
    expect(inner).toHaveClass("lg:sticky", "lg:top-0", "lg:h-dvh");
  });

  // Below lg the column is a strip over the content: a viewport-tall sticky
  // there would cover the whole screen.
  it("is a strip, not a sticky column, below lg", () => {
    const { container } = sidebar();
    const column = container.firstElementChild as HTMLElement;
    const inner = column.firstElementChild as HTMLElement;
    expect(column).toHaveClass("border-b", "lg:border-b-0");
    expect(column).not.toHaveClass("border-r");
    expect(inner).not.toHaveClass("sticky", "h-dvh");
    const nav = screen.getByRole("navigation", { name: "Console" });
    expect(nav).toHaveClass("overflow-x-auto", "lg:flex-col");
    // The row scrolls sideways; a faded right edge says there is more.
    expect(nav).toHaveClass(
      "[mask-image:linear-gradient(to_right,#000_85%,transparent)]",
      "lg:[mask-image:none]",
    );
    // Room at the end, so the last item scrolls clear of the fade.
    expect(nav).toHaveClass("pr-8", "lg:pr-0");
    expect(nav).not.toHaveClass("flex-col");
  });

  it("eases the identity link's hover border", () => {
    sidebar();
    expect(screen.getByRole("link", { name: "Account settings for a.ivanova" })).toHaveClass(
      "transition-colors",
      "duration-150",
    );
  });

  it("scrolls only its navigation, keeping the brand and the identity in place", () => {
    sidebar();
    expect(screen.getByRole("navigation", { name: "Console" })).toHaveClass("lg:overflow-y-auto");
  });

  it("is not a complementary region — the nav inside is the landmark", () => {
    sidebar();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Console" })).toBeInTheDocument();
  });
});
