import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DocumentRow } from "./document-row";

describe("DocumentRow", () => {
  it("prints the file name and opens it by id", async () => {
    const onOpen = vi.fn();
    render(<DocumentRow id={3} name="plan-sheet-03.pdf" onOpen={onOpen} />);

    expect(screen.getByText("plan-sheet-03.pdf")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open plan-sheet-03.pdf" }));
    expect(onOpen).toHaveBeenCalledWith(3);
  });

  it("keeps the visible word short and names the control after its file", () => {
    render(<DocumentRow id={3} name="plan-sheet-03.pdf" onOpen={vi.fn()} />);
    const open = screen.getByRole("button", { name: "Open plan-sheet-03.pdf" });
    expect(open).toHaveTextContent("Open");
    expect(open).toHaveAttribute("title", "Open plan-sheet-03.pdf");
  });

  it("presses Open", () => {
    render(<DocumentRow id={3} name="plan-sheet-03.pdf" onOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Open plan-sheet-03.pdf" })).toHaveClass(
      "active:scale-[0.97]",
      "ease-out",
    );
  });
});
