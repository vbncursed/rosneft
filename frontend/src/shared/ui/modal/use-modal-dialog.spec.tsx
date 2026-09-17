import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useModalDialog } from "./use-modal-dialog";

function Probe({ open, onClose = () => {} }: { open: boolean; onClose?: () => void }) {
  const { ref, shown } = useModalDialog(open, onClose);
  return (
    <dialog ref={ref} data-testid="dialog">
      {shown ? <p>body</p> : null}
    </dialog>
  );
}

const dialog = () => screen.getByTestId("dialog") as HTMLDialogElement;

/** Gives the element a running exit transition jsdom cannot produce. */
function stubExit() {
  let settle!: () => void;
  let cancel!: () => void;
  const finished = new Promise<void>((resolve, reject) => {
    settle = resolve;
    cancel = () => reject(new Error("cancelled"));
  });
  finished.catch(() => {});
  const getAnimations = vi.fn(() => [{ finished } as unknown as Animation]);
  Object.defineProperty(HTMLDialogElement.prototype, "getAnimations", {
    configurable: true,
    value: getAnimations,
  });
  return { settle, cancel };
}

afterEach(() => {
  delete (HTMLDialogElement.prototype as { getAnimations?: unknown }).getAnimations;
});

describe("useModalDialog", () => {
  it("opens the element and mounts the body while open", () => {
    render(<Probe open />);
    expect(dialog().open).toBe(true);
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("keeps a closed element in the tree with no body", () => {
    const { rerender } = render(<Probe open />);
    rerender(<Probe open={false} />);
    expect(dialog().open).toBe(false);
    expect(screen.queryByText("body")).not.toBeInTheDocument();
  });

  it("keeps the body until the exit transition has played", async () => {
    const exit = stubExit();
    const { rerender } = render(<Probe open />);
    rerender(<Probe open={false} />);
    expect(dialog().open).toBe(false);
    expect(screen.getByText("body")).toBeInTheDocument();

    await act(async () => exit.settle());
    expect(screen.queryByText("body")).not.toBeInTheDocument();
  });

  it("keeps the body when a reopen cancels the exit", async () => {
    const exit = stubExit();
    const { rerender } = render(<Probe open />);
    rerender(<Probe open={false} />);
    rerender(<Probe open />);
    await act(async () => exit.cancel());
    expect(dialog().open).toBe(true);
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("closes the element before a caller unmounts it", () => {
    const { unmount } = render(<Probe open />);
    const el = dialog();
    unmount();
    expect(el.open).toBe(false);
  });

  it("routes Escape to onClose only while open", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Probe open={false} onClose={onClose} />);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).not.toHaveBeenCalled();

    rerender(<Probe open onClose={onClose} />);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
