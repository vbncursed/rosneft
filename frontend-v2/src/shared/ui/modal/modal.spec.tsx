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
