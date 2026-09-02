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
  it("shows the theme in effect", () => {
    render(<ThemeToggle />);
    expect(screen.getByText("dark")).toBeInTheDocument();
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
