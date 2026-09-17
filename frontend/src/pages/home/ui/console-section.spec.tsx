import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleSection } from "./console-section";
import type { ConsoleCardProps } from "./console-card";

const open = (label: string, href: string, text: string): ConsoleCardProps => ({
  label,
  href,
  hint: { kind: "count", text },
  locked: false,
});
const locked = (label: string, href: string): ConsoleCardProps => ({
  label,
  href,
  hint: { kind: "static", text: "conversion health and alerts" },
  locked: true,
});

describe("ConsoleSection", () => {
  it("draws one card per screen, locked ones without a link", () => {
    render(
      <ConsoleSection
        cards={[open("Users", "/console/users", "12 users"), locked("Metrics", "/console/metrics")]}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Console" })).toBeInTheDocument();
    expect(screen.getByText("company administration")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Users/ })).toBeInTheDocument();
    expect(screen.getByText("Metrics").closest("[aria-disabled]")).toBeInTheDocument();
  });

  it("offers the console itself after the heading's rule", () => {
    render(<ConsoleSection cards={[open("Users", "/console/users", "12 users")]} />);
    expect(screen.getByRole("link", { name: "Console →" })).toHaveAttribute("href", "/console");
  });
});
