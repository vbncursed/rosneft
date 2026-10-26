import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { documentsCount } from "../model/copy";
import { DocumentsSection, type DocumentsSectionProps } from "./documents-section";

const base = (over: Partial<DocumentsSectionProps> = {}): DocumentsSectionProps => ({
  rows: [{ id: 3, name: "plan.pdf", aligned: false }],
  canUpload: false,
  onUpload: vi.fn(),
  onOpen: vi.fn(),
  fold: { open: true, locked: false, onToggle: vi.fn() },
  ...over,
});

describe("DocumentsSection", () => {
  it("counts the rows and opens one by id", async () => {
    const props = base();
    render(<DocumentsSection {...props} />);
    expect(screen.getByText(documentsCount(1))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open plan.pdf" }));
    expect(props.onOpen).toHaveBeenCalledWith(3);
  });

  it("keeps the list empty while folded, and its head points at it", () => {
    render(<DocumentsSection {...base({ fold: { open: false, locked: false, onToggle: vi.fn() } })} />);
    expect(screen.queryByRole("button", { name: "Open plan.pdf" })).toBeNull();
    const head = screen.getByRole("button", { expanded: false });
    expect(document.getElementById(head.getAttribute("aria-controls")!)).not.toBeNull();
  });

  it("offers upload only to a writer, and Align plan only with a handler", async () => {
    const onAlign = vi.fn();
    const { rerender } = render(<DocumentsSection {...base()} />);
    expect(screen.queryByRole("button", { name: /Align plan/ })).toBeNull();
    rerender(<DocumentsSection {...base({ canUpload: true, onAlign })} />);
    await userEvent.click(screen.getByRole("button", { name: "Align plan for plan.pdf" }));
    expect(onAlign).toHaveBeenCalledWith(3);
  });

  it("has a plain head when there is nothing to fold", () => {
    render(<DocumentsSection {...base({ rows: [] })} />);
    expect(screen.queryByRole("button", { expanded: true })).toBeNull();
  });
});
