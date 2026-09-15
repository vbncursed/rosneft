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
});
