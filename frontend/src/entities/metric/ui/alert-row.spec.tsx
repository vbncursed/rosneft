import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlertRow } from "./alert-row";

describe("AlertRow", () => {
  it("names what fired", () => {
    render(<AlertRow name="HighErrorRate · gateway" severity="firing" />);
    expect(screen.getByText("HighErrorRate · gateway")).toBeInTheDocument();
  });

  it("writes the severity out, never leaving it to colour alone", () => {
    const { rerender } = render(<AlertRow name="A" severity="firing" />);
    expect(screen.getByText("firing")).toBeInTheDocument();

    rerender(<AlertRow name="A" severity="pending" />);
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("skins each severity to its meaning", () => {
    const { container, rerender } = render(<AlertRow name="A" severity="firing" />);
    expect(container.firstElementChild!.className).toContain("border-bad");

    rerender(<AlertRow name="A" severity="pending" />);
    expect(container.firstElementChild!.className).toContain("border-warn");
  });
});
