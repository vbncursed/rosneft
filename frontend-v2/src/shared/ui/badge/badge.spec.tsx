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

  it("draws the accent ring solid, not translucent — the design's Root pill", () => {
    render(<Badge tone="accent">Root</Badge>);
    const cls = screen.getByText("Root").className;
    expect(cls).toContain("border-accent");
    expect(cls).not.toContain("border-accent-line");
  });

  it("writes a filled neutral chip in the foreground ink, an outlined one muted", () => {
    const { rerender } = render(<Badge tone="neutral" fill="soft">Field Operator</Badge>);
    expect(screen.getByText("Field Operator").className).toContain("text-fg");

    rerender(<Badge tone="neutral" fill="outline">Company Owner</Badge>);
    expect(screen.getByText("Company Owner").className).toContain("text-muted");
  });

  it("tracks a chip tighter than a pill — the two must never both carry a tracking-* class", () => {
    render(<Badge shape="chip">3 placements</Badge>);
    const cls = screen.getByText("3 placements").className;
    expect(cls).toContain("tracking-[0.06em]");
    expect(cls).not.toContain("tracking-[0.16em]");
    expect(cls).not.toContain("tracking-[0.14em]");
  });

  it("keeps the pill's own tracking at the default md size", () => {
    render(<Badge shape="pill">ready</Badge>);
    const cls = screen.getByText("ready").className;
    expect(cls).toContain("tracking-[0.16em]");
    expect(cls).not.toContain("tracking-[0.06em]");
  });
});
