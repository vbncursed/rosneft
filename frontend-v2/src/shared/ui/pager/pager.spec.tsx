import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pager } from "./pager";

describe("Pager", () => {
  it("names every page chip, marks the current one and skips the gaps", () => {
    render(<Pager page={5} pageCount={31} onPage={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 5" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Page 30" })).not.toHaveAttribute("aria-current");
    expect(screen.getAllByRole("button", { name: /^Page \d+$/ })).toHaveLength(6);
    expect(screen.getAllByText("…")).toHaveLength(2);
  });

  it("disables Prev on the first page and Next on the last", () => {
    const { rerender } = render(<Pager page={1} pageCount={3} onPage={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    rerender(<Pager page={3} pageCount={3} onPage={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("asks for the page that was clicked, and for the neighbours from Prev and Next", async () => {
    const onPage = vi.fn();
    render(<Pager page={2} pageCount={3} onPage={onPage} />);
    await userEvent.click(screen.getByRole("button", { name: "Page 3" }));
    await userEvent.click(screen.getByRole("button", { name: "Prev" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPage.mock.calls.map(([n]) => n)).toEqual([3, 1, 3]);
  });

  it("disables every control while busy", () => {
    render(<Pager page={2} pageCount={3} onPage={vi.fn()} busy />);
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
  });
});
