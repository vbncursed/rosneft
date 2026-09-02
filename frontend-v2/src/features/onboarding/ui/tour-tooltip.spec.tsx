import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TourTooltip } from "./tour-tooltip";

const props = {
  step: 2,
  total: 5,
  title: "Placements panel",
  body: "Drop a model onto the scene and adjust its transform with the gizmo.",
  onNext: vi.fn(),
  onBack: vi.fn(),
  onSkip: vi.fn(),
};

describe("TourTooltip", () => {
  it("says where in the tour the reader is", () => {
    render(<TourTooltip {...props} />);
    expect(screen.getByRole("dialog", { name: "Tour step 2 of 5" })).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 5")).toBeInTheDocument();
  });

  it("shows the step's title and body", () => {
    render(<TourTooltip {...props} />);
    expect(screen.getByText("Placements panel")).toBeInTheDocument();
    expect(screen.getByText(/Drop a model onto the scene/)).toBeInTheDocument();
  });

  it("cannot go back from the first step", () => {
    render(<TourTooltip {...props} step={1} />);
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  it("finishes rather than advancing on the last step", () => {
    render(<TourTooltip {...props} step={5} />);
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("moves through the tour", async () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    const onSkip = vi.fn();
    render(<TourTooltip {...props} onNext={onNext} onBack={onBack} onSkip={onSkip} />);

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(screen.getByRole("button", { name: "Skip tour" }));

    expect(onNext).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
    expect(onSkip).toHaveBeenCalledOnce();
  });
});
