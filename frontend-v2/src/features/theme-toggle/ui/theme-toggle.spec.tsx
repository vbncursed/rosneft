import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The theme is a module-level store now, so a case that toggles would leak its
// choice into the next one. Each case reads the module afresh, which is also
// where the OS preference stubbed just above is consulted.
const load = async () => {
  vi.resetModules();
  return (await import("./theme-toggle")).ThemeToggle;
};

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false } as MediaQueryList));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ThemeToggle", () => {
  it("shows the theme in effect, under its own label", async () => {
    const ThemeToggle = await load();
    render(<ThemeToggle />);
    expect(screen.getByText("dark")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
  });

  it("takes a different label", async () => {
    const ThemeToggle = await load();
    render(<ThemeToggle label="Theme" />);
    expect(screen.getByText("Theme")).toBeInTheDocument();
  });

  it("names both the current theme and what pressing it does", async () => {
    const ThemeToggle = await load();
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: "Theme: dark. Switch to light" }),
    ).toBeInTheDocument();
  });

  it("switches the document's theme", async () => {
    const ThemeToggle = await load();
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button"));

    expect(screen.getByText("light")).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("switches back", async () => {
    const ThemeToggle = await load();
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

  it("gives the compact pill the design system's panel ground, and only one ground", async () => {
    const ThemeToggle = await load();
    render(<ThemeToggle variant="compact" />);
    expect(ground(screen.getByRole("button", { name: /^Theme:/ }).className)).toEqual(["bg-panel"]);
  });

  // Our own extension, not in the design system: the row sits in a panel-2
  // wrapper, so the button keeps the panel ground to stand off it. Making
  // this panel-2 to match its container would flatten the row.
  it("keeps the labelled button on panel so it reads against the panel-2 row", async () => {
    const ThemeToggle = await load();
    const { container } = render(<ThemeToggle />);
    expect(ground(screen.getByRole("button", { name: /^Theme:/ }).className)).toEqual(["bg-panel"]);
    expect(container.firstElementChild!.className).toContain("bg-panel-2");
  });

  it("pads the compact pill to the design system's 6px, not 5", async () => {
    const ThemeToggle = await load();
    render(<ThemeToggle variant="compact" />);
    const cls = screen.getByRole("button", { name: /^Theme:/ }).className;
    expect(cls).toContain("py-1.5");
    expect(cls).not.toContain("py-[5px]");
  });
});

describe("ThemeToggle · compact", () => {
  it("drops the label and rounds the button", async () => {
    const ThemeToggle = await load();
    render(<ThemeToggle variant="compact" />);
    expect(screen.queryByText("Appearance")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Theme:/ }).className).toContain("rounded-full");
  });

  it("still names the current theme and what pressing it does", async () => {
    const ThemeToggle = await load();
    render(<ThemeToggle variant="compact" />);
    expect(screen.getByRole("button", { name: "Theme: dark. Switch to light" })).toBeInTheDocument();
  });
});
