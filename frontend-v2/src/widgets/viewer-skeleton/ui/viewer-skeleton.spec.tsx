import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ViewerSkeleton } from "./viewer-skeleton";

describe("ViewerSkeleton", () => {
  it("says what is happening", () => {
    render(<ViewerSkeleton progress={45} />);
    expect(screen.getByText("Loading interface…")).toBeInTheDocument();
  });

  it("reports the progress it was given", () => {
    render(<ViewerSkeleton progress={45} />);
    expect(screen.getByRole("progressbar", { name: "Loading interface…" })).toHaveAttribute(
      "aria-valuenow",
      "45",
    );
  });

  it("runs indeterminate before the loader reports anything", () => {
    render(<ViewerSkeleton />);
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  });

  it("takes a caller's label, for the bar as well as the text", () => {
    render(<ViewerSkeleton progress={10} label="Downloading LOD0…" />);
    expect(screen.getByText("Downloading LOD0…")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Downloading LOD0…" })).toBeInTheDocument();
  });
});
