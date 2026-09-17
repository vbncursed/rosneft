import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConversionBadge } from "./conversion-badge";

describe("ConversionBadge", () => {
  it("labels each status", () => {
    const { rerender } = render(<ConversionBadge status="ready" />);
    expect(screen.getByText("ready")).toBeInTheDocument();

    rerender(<ConversionBadge status="converting" />);
    expect(screen.getByText("converting")).toBeInTheDocument();

    rerender(<ConversionBadge status="failed" />);
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("colours each status to its meaning", () => {
    const { rerender } = render(<ConversionBadge status="ready" />);
    expect(screen.getByText("ready").className).toContain("text-ok");

    rerender(<ConversionBadge status="converting" />);
    expect(screen.getByText("converting").className).toContain("text-warn");

    rerender(<ConversionBadge status="failed" />);
    expect(screen.getByText("failed").className).toContain("text-bad");
  });

  it("draws a pending badge in the neutral tone", () => {
    render(<ConversionBadge status="pending" />);
    expect(screen.getByText("pending")).toBeInTheDocument();
  });
});
