import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./theme-toggle";

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false } as MediaQueryList));
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemeToggle", () => {
  it("shows the theme in effect, under its own label", () => {
    render(<ThemeToggle />);
    expect(screen.getByText("dark")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
  });

  it("takes a different label", () => {
    render(<ThemeToggle label="Theme" />);
    expect(screen.getByText("Theme")).toBeInTheDocument();
  });

  it("names both the current theme and what pressing it does", () => {
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: "Theme: dark. Switch to light" }),
    ).toBeInTheDocument();
  });

  it("switches the document's theme", async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button"));

    expect(screen.getByText("light")).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("switches back", async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(screen.getByRole("button"));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

// A variant test on token classes, which this codebase sanctions as the
// exception to "assert what a user can observe": jsdom computes no colour, so
// the class is the only place the ground can be pinned. Two background
// utilities on one element are resolved by the compiled stylesheet's own
// source order, not by the className string's — the same trap that already
// bit Button's tracking twice — so this asserts there is exactly one.
describe("ThemeToggle · the ground is decided once", () => {
  const ground = (className: string) => className.match(/\bbg-[a-z0-9-]+/g) ?? [];

  it("gives the compact pill the design system's panel ground, and only one ground", () => {
    render(<ThemeToggle variant="compact" />);
    expect(ground(screen.getByRole("button", { name: /^Theme:/ }).className)).toEqual(["bg-panel"]);
  });

  // Our own extension, not in the design system: the row sits in a panel-2
  // wrapper, so the button keeps the panel ground to stand off it. Making
  // this panel-2 to match its container would flatten the row.
  it("keeps the labelled button on panel so it reads against the panel-2 row", () => {
    const { container } = render(<ThemeToggle />);
    expect(ground(screen.getByRole("button", { name: /^Theme:/ }).className)).toEqual(["bg-panel"]);
    expect(container.firstElementChild!.className).toContain("bg-panel-2");
  });

  it("pads the compact pill to the design system's 6px, not 5", () => {
    render(<ThemeToggle variant="compact" />);
    const cls = screen.getByRole("button", { name: /^Theme:/ }).className;
    expect(cls).toContain("py-1.5");
    expect(cls).not.toContain("py-[5px]");
  });
});

describe("ThemeToggle · compact", () => {
  it("drops the label and rounds the button", () => {
    render(<ThemeToggle variant="compact" />);
    expect(screen.queryByText("Appearance")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Theme:/ }).className).toContain("rounded-full");
  });

  it("still names the current theme and what pressing it does", () => {
    render(<ThemeToggle variant="compact" />);
    expect(screen.getByRole("button", { name: "Theme: dark. Switch to light" })).toBeInTheDocument();
  });
});
