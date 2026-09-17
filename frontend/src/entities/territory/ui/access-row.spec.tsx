import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccessRow } from "./access-row";

describe("AccessRow", () => {
  it("names the territory", () => {
    render(<AccessRow slug="refinery-block-c" via="direct" />);
    expect(screen.getByText("refinery-block-c")).toBeInTheDocument();
  });

  it("distinguishes a direct grant from one inherited through a role", () => {
    const { rerender } = render(<AccessRow slug="t" via="direct" />);
    expect(screen.getByText("direct").className).toContain("text-accent");

    rerender(<AccessRow slug="t" via="role" />);
    expect(screen.getByText("via role").className).toContain("text-muted");
  });

  it("spells the inherited case out rather than leaving it to colour", () => {
    render(<AccessRow slug="north-ridge-pad" via="role" />);
    expect(screen.getByText("via role")).toBeInTheDocument();
  });
});
