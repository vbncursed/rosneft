import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useEscape } from "./use-escape";

function Probe({ active, onEscape }: { active: boolean; onEscape: () => void }) {
  useEscape(active, onEscape);
  return <button type="button">focusable</button>;
}

describe("useEscape", () => {
  it("fires on Escape while active", async () => {
    const onEscape = vi.fn();
    render(<Probe active onEscape={onEscape} />);
    await userEvent.keyboard("{Escape}");
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it("stays quiet while inactive", async () => {
    const onEscape = vi.fn();
    render(<Probe active={false} onEscape={onEscape} />);
    await userEvent.keyboard("{Escape}");
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("ignores every other key", async () => {
    const onEscape = vi.fn();
    render(<Probe active onEscape={onEscape} />);
    await userEvent.keyboard("{Enter}a{ArrowDown}");
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("listens on the document, so focus need not be inside the popup", async () => {
    const onEscape = vi.fn();
    render(<Probe active onEscape={onEscape} />);
    document.body.focus();
    await userEvent.keyboard("{Escape}");
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it("detaches when it goes inactive", async () => {
    const onEscape = vi.fn();
    const { rerender } = render(<Probe active onEscape={onEscape} />);
    rerender(<Probe active={false} onEscape={onEscape} />);
    await userEvent.keyboard("{Escape}");
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("detaches on unmount", async () => {
    const onEscape = vi.fn();
    const { unmount } = render(<Probe active onEscape={onEscape} />);
    unmount();
    await userEvent.keyboard("{Escape}");
    expect(onEscape).not.toHaveBeenCalled();
  });
});
