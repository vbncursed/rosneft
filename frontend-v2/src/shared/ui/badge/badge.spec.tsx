import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";

describe("Badge", () => {
  it("renders its label", () => {
    render(<Badge>active</Badge>);
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("tints the ground only when filled soft", () => {
    const { rerender } = render(<Badge tone="ok" fill="soft">yes</Badge>);
    expect(screen.getByText("yes").className).toContain("bg-ok-soft");

    rerender(<Badge tone="ok" fill="outline">yes</Badge>);
    expect(screen.getByText("yes").className).toContain("bg-transparent");
    expect(screen.getByText("yes").className).not.toContain("bg-ok-soft");
  });

  it("switches the corner radius by shape", () => {
    const { rerender } = render(<Badge shape="pill">root</Badge>);
    expect(screen.getByText("root").className).toContain("rounded-full");

    rerender(<Badge shape="tag">failed</Badge>);
    expect(screen.getByText("failed").className).toContain("rounded");
    expect(screen.getByText("failed").className).not.toContain("rounded-full");
  });

  it("carries the tone colour through", () => {
    render(<Badge tone="bad">2fa no</Badge>);
    expect(screen.getByText("2fa no").className).toContain("text-bad");
  });
});
