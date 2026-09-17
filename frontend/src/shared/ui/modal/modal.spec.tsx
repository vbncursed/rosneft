import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/shared/ui/button";
import { Modal } from "./modal";

function Harness({ onConfirm }: { onConfirm?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Make Root"
        overline="Confirm · default"
        description="Grant Root to d.smirnov?"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                onConfirm?.();
                setOpen(false);
              }}
            >
              Make Root
            </Button>
          </>
        }
      />
    </>
  );
}

describe("Modal", () => {
  it("renders nothing while closed", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens as a dialog named by its title", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));

    const dialog = screen.getByRole("dialog", { name: "Make Root" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Grant Root to d.smirnov?")).toBeInTheDocument();
  });

  it("keeps an action out of the name it is named by", async () => {
    // aria-labelledby points at the <h2>; a close button inside it made the
    // dialog announce "Add a panorama to X Close panorama upload".
    render(
      <Modal
        open
        onClose={vi.fn()}
        title="Add a panorama"
        action={<button type="button" aria-label="Close panorama upload" />}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Add a panorama" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close panorama upload" })).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("runs the confirming action and closes", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("button", { name: "Make Root" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancels without acting", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marks a danger modal with the destructive border", () => {
    render(
      <Modal open onClose={() => {}} tone="danger" title="Remove passkey" overline="Confirm · danger">
        <p>body</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog").className).toContain("border-bad");
  });

  it("widens to the large size the model picker needs", () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Add objects">
        <p>body</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog").className).toContain("w-[min(28rem,calc(100vw-2rem))]");

    rerender(
      <Modal open onClose={() => {}} title="Add objects" size="lg">
        <p>body</p>
      </Modal>,
    );
    const wide = screen.getByRole("dialog");
    expect(wide.className).toContain("w-[min(45rem,calc(100vw-2rem))]");
    expect(wide.className).not.toContain("w-[min(28rem,calc(100vw-2rem))]");
  });

  it("narrows to the 520px size the upload modal needs", () => {
    render(
      <Modal open onClose={() => {}} title="Upload progress" size="sm">
        <p>body</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog").className).toContain("w-[min(32.5rem,calc(100vw-2rem))]");
  });

  it("does not clip a floating child such as an open Dropdown list", () => {
    render(
      <Modal open onClose={() => {}} title="Add role">
        <p>body</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog").className).toContain("overflow-visible");
  });

  it("hosts extra controls between the description and the footer", async () => {
    render(
      <Modal
        open
        onClose={() => {}}
        title="Remove passkey"
        description="Enter your account password."
      >
        <input aria-label="Password" type="password" />
      </Modal>,
    );
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    expect(screen.getByLabelText("Password")).toHaveValue("secret");
  });
});

describe("Modal · native cancel", () => {
  it("routes the browser's own Escape (the cancel event) through onClose", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Make Root">
        body
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    const cancel = new Event("cancel", { bubbles: true, cancelable: true });
    dialog.dispatchEvent(cancel);

    expect(onClose).toHaveBeenCalledOnce();
    // Prevented, so the element cannot close behind the caller's back and
    // leave `open` claiming it is still up.
    expect(cancel.defaultPrevented).toBe(true);
  });

  it("closes the underlying element when open goes false", () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Make Root">
        body
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    rerender(
      <Modal open={false} onClose={() => {}} title="Make Root">
        body
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Modal · warning tone", () => {
  it("paints the warning tone on the box and the overline", async () => {
    render(
      <Modal open onClose={() => {}} tone="warning" overline="Remove passkey · blocked" title="Two-factor status unavailable" />,
    );
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog.className).toContain("border-warn");
    expect(screen.getByText("Remove passkey · blocked").className).toContain("text-warn");
  });
});

describe("Modal · pointer events", () => {
  // `pointer-events` is inherited, and promotion to the top layer does not
  // break that chain: a dialog whose DOM parent sets `none` — the viewer's
  // document-window layer does — is unclickable, confirm button and all.
  it("takes its own pointer events back from an ancestor that gave them up", () => {
    render(
      <Modal open onClose={() => {}} title="Delete plan-sheet-03.pdf?">
        body
      </Modal>,
    );
    expect(screen.getByRole("dialog", { hidden: true }).className).toContain("pointer-events-auto");
  });
});

describe("Modal · focus return", () => {
  // A closed <dialog> hands focus back to whatever opened it — but only if the
  // element is still attached when close() runs. Unmounted first, focus fell
  // to <body> and the next Tab started from the top of the document.
  it("returns focus to the trigger after Cancel", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  it("returns focus to the trigger after Escape", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  it("returns focus when the caller unmounts it rather than closing it", async () => {
    function Mounting() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open</Button>
          {open ? (
            <Modal open onClose={() => setOpen(false)} title="Create user">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
            </Modal>
          ) : null}
        </>
      );
    }
    render(<Mounting />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });
});

describe("Modal · closed element", () => {
  // An author `display` would beat the UA's `dialog:not([open])` rule and
  // draw the closed dialog in the page flow; only the open one may be flex.
  it("stays in the tree while closed and is laid out as flex only when open", () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} title="Make Root">
        body
      </Modal>,
    );
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(false);
    expect(dialog.classList).toContain("open:flex");
    expect(dialog.classList).not.toContain("flex");
    expect(dialog.className).not.toContain("backdrop:");
  });
});
