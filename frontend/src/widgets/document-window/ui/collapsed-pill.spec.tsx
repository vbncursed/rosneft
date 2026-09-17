import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CollapsedPill } from "./collapsed-pill";

describe("CollapsedPill", () => {
  it("names the file and brings the window back on Show", async () => {
    const onShow = vi.fn();
    render(<CollapsedPill file="plan-sheet-03.pdf" onShow={onShow} />);

    expect(screen.getByText("plan-sheet-03.pdf")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(onShow).toHaveBeenCalledOnce();
  });

  // It was the one button in the panel with no hover, no transition and no
  // accent focus ring; its neighbours all have them.
  it("answers hover, focus and press like its neighbours", () => {
    render(<CollapsedPill file="plan-sheet-03.pdf" onShow={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Show" })).toHaveClass(
      "hover:border-accent-line",
      "focus-visible:outline-accent",
      "focus-visible:outline-offset-2",
      "active:scale-[0.97]",
      "ease-out",
    );
  });
});
