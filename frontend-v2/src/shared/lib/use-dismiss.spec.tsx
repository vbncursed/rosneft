import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useDismiss } from "./use-dismiss";

function Probe({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, onDismiss);
  return (
    <>
      <div ref={ref}>
        <button type="button">inside</button>
      </div>
      <button type="button">outside</button>
    </>
  );
}

describe("useDismiss", () => {
  it("dismisses on a pointer outside the popup", async () => {
    const onDismiss = vi.fn();
    render(<Probe open onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: "outside" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("leaves a pointer inside the popup alone", async () => {
    const onDismiss = vi.fn();
    render(<Probe open onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: "inside" }));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("dismisses on Escape", async () => {
    const onDismiss = vi.fn();
    render(<Probe open onDismiss={onDismiss} />);
    await userEvent.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("does nothing while closed", async () => {
    const onDismiss = vi.fn();
    render(<Probe open={false} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: "outside" }));
    await userEvent.keyboard("{Escape}");
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("detaches both listeners on unmount", async () => {
    const onDismiss = vi.fn();
    const { unmount } = render(<Probe open onDismiss={onDismiss} />);
    unmount();
    await userEvent.click(document.body);
    await userEvent.keyboard("{Escape}");
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
