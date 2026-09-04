import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Callout } from "./callout";

describe("Callout", () => {
  it("shows its message", () => {
    render(<Callout tone="bad">No 2FA and no passkey — password only.</Callout>);
    expect(screen.getByText("No 2FA and no passkey — password only.")).toBeInTheDocument();
  });

  it("announces a problem as an alert, and everything else as a status", () => {
    const { rerender } = render(<Callout tone="bad">Weak</Callout>);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<Callout tone="ok">Fine</Callout>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("gives a warn callout a live region too — a keystroke that empties a screen still gets announced", () => {
    render(<Callout tone="warn">No actor named x.</Callout>);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("skins each tone", () => {
    const { container, rerender } = render(<Callout tone="warn">w</Callout>);
    expect(container.firstElementChild!.className).toContain("border-warn");

    rerender(<Callout tone="accent">a</Callout>);
    expect(container.firstElementChild!.className).toContain("border-accent-line");
  });

  it("carries the warning triangle by default and takes another glyph", () => {
    const { container, rerender } = render(<Callout tone="bad">w</Callout>);
    expect(container.querySelector("svg")).toBeInTheDocument();

    rerender(
      <Callout tone="ok" icon="eye">
        seen
      </Callout>,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("keeps the icon decorative — the text carries the meaning", () => {
    const { container } = render(<Callout tone="bad">w</Callout>);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
