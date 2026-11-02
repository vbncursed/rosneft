import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TagChip } from "./tag-chip";

describe("TagChip", () => {
  it("prints the tag's title", () => {
    render(<TagChip tag={{ slug: "tanks", title: "Tanks" }} />);
    expect(screen.getByText("Tanks")).toBeInTheDocument();
  });
});
