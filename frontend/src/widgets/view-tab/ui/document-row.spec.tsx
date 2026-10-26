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

  it("offers Align plan on an unaligned file and Edit zones on an aligned one, only when allowed", async () => {
    const onAlign = vi.fn();
    const { rerender } = render(<DocumentRow id={3} name="plan.pdf" onOpen={vi.fn()} onAlign={onAlign} />);
    await userEvent.click(screen.getByRole("button", { name: "Align plan for plan.pdf" }));
    expect(onAlign).toHaveBeenCalledWith(3);

    rerender(<DocumentRow id={3} name="plan.pdf" onOpen={vi.fn()} onAlign={onAlign} aligned />);
    expect(screen.getByRole("button", { name: "Edit zones of plan.pdf" })).toHaveTextContent("Edit zones");

    rerender(<DocumentRow id={3} name="plan.pdf" onOpen={vi.fn()} aligned />);
    expect(screen.queryByRole("button", { name: /zones|Align/ })).toBeNull();
  });
});

describe("DocumentRow tour anchor", () => {
  it("anchors the tour on the Align plan button, and on Edit zones once aligned", () => {
    const { rerender } = render(<DocumentRow id={1} name="p.pdf" onOpen={vi.fn()} onAlign={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Align plan for p.pdf" })).toHaveAttribute("data-tour", "document-align");
    rerender(<DocumentRow id={1} name="p.pdf" onOpen={vi.fn()} onAlign={vi.fn()} aligned />);
    expect(screen.getByRole("button", { name: "Edit zones of p.pdf" })).toHaveAttribute("data-tour", "document-align");
  });

  it("has no anchor for a reader without the grant, so the tour step skips itself", () => {
    const { container } = render(<DocumentRow id={1} name="p.pdf" onOpen={vi.fn()} />);
    expect(container.querySelector('[data-tour="document-align"]')).toBeNull();
  });
});
