import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrailingLink } from "./trailing-link";

describe("TrailingLink", () => {
  it("is a link with the section's destination and its words", () => {
    render(<TrailingLink href="/territories">See all 12 territories →</TrailingLink>);
    expect(screen.getByRole("link", { name: "See all 12 territories →" })).toHaveAttribute(
      "href",
      "/territories",
    );
  });
});
