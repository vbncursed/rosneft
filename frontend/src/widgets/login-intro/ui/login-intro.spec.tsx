import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginIntro, type LoginIntroProps } from "./login-intro";

const props = (over: Partial<LoginIntroProps> = {}): LoginIntroProps => ({
  brand: "Andrey · 3D Platform",
  headline: "Territories and models, rendered with precision",
  blurb: "Heavy conversion runs server-side.",
  points: [
    { title: "Walk the site in 3D", hint: "No plugins, no downloads." },
    { title: "Measure without a trip", hint: "Chain distances across pipe racks." },
  ],
  ...over,
});

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false } as MediaQueryList));
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("LoginIntro", () => {
  it("is a labelled region carrying the brand and the pitch", () => {
    render(<LoginIntro {...props()} />);
    expect(screen.getByRole("region", { name: "About this platform" })).toBeInTheDocument();
    expect(screen.getByText("Andrey · 3D Platform")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Territories and models, rendered with precision" }),
    ).toBeInTheDocument();
  });

  it("lists the selling points, each with its explanation", () => {
    render(<LoginIntro {...props()} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Walk the site in 3D")).toBeInTheDocument();
    expect(screen.getByText("No plugins, no downloads.")).toBeInTheDocument();
  });

  it("hosts the theme control", () => {
    render(<LoginIntro {...props()} />);
    expect(screen.getByRole("button", { name: /^Theme:/ })).toBeInTheDocument();
  });

  it("shows a footnote only when there is one", () => {
    const { rerender } = render(<LoginIntro {...props()} />);
    expect(screen.queryByText(/httpOnly/)).not.toBeInTheDocument();

    rerender(<LoginIntro {...props({ footnote: "gateway · httpOnly session" })} />);
    expect(screen.getByText("gateway · httpOnly session")).toBeInTheDocument();
  });

  it("keeps the brand mark out of the accessible text — it is decoration", () => {
    const { container } = render(<LoginIntro {...props({ mark: "A" })} />);
    expect(container.querySelector("span[aria-hidden]")).toHaveTextContent("A");
  });
});
