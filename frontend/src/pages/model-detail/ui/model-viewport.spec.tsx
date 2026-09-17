import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModelViewport } from "./model-viewport";

describe("ModelViewport", () => {
  it("shows the thumbnail as an image named after the title", () => {
    render(<ModelViewport title="Valve Assembly" thumbnailUrl="/api/assets/h0" />);
    expect(screen.getByRole("img", { name: "Valve Assembly" })).toHaveAttribute("src", "/api/assets/h0");
  });

  it("shows the no-image placeholder without a thumbnail", () => {
    render(<ModelViewport title="Valve Assembly" thumbnailUrl={null} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("no image")).toBeInTheDocument();
  });
});
