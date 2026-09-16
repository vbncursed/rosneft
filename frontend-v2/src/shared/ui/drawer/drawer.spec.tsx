import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/text-field";
import { Drawer } from "./drawer";

function Harness({ onCreate }: { onCreate?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>+ New user</Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New user"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                onCreate?.();
                setOpen(false);
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <TextField label="username" />
        <TextField label="email" />
      </Drawer>
    </>
  );
}

describe("Drawer", () => {
  it("stays out of the tree while closed", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens named by its title and shows its body", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "+ New user" }));
    expect(screen.getByRole("dialog", { name: "New user" })).toBeInTheDocument();
    expect(screen.getByLabelText("username")).toBeInTheDocument();
  });

  it("closes from its own × control", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "+ New user" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "+ New user" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("submits through the footer action", async () => {
    const onCreate = vi.fn();
    render(<Harness onCreate={onCreate} />);
    await userEvent.click(screen.getByRole("button", { name: "+ New user" }));
    await userEvent.type(screen.getByLabelText("username"), "d.smirnov");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("anchors to the side it is told", () => {
    const { rerender } = render(
      <Drawer open onClose={() => {}} title="Panel">
        body
      </Drawer>,
    );
    expect(screen.getByRole("dialog").className).toContain("ml-auto");

    rerender(
      <Drawer open onClose={() => {}} title="Panel" side="left">
        body
      </Drawer>,
    );
    expect(screen.getByRole("dialog").className).toContain("mr-auto");
  });
});

describe("Drawer · native cancel", () => {
  it("routes the browser's own Escape through onClose without closing behind it", () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="New user">
        body
      </Drawer>,
    );
    const cancel = new Event("cancel", { bubbles: true, cancelable: true });
    screen.getByRole("dialog").dispatchEvent(cancel);

    expect(onClose).toHaveBeenCalledOnce();
    expect(cancel.defaultPrevented).toBe(true);
  });

  it("leaves the tree when open goes false", () => {
    const { rerender } = render(
      <Drawer open onClose={() => {}} title="New user">
        body
      </Drawer>,
    );
    rerender(
      <Drawer open={false} onClose={() => {}} title="New user">
        body
      </Drawer>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Drawer · focus return", () => {
  it("returns focus to the trigger after its × control", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "+ New user" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "+ New user" })).toHaveFocus();
  });

  it("returns focus to the trigger after Escape", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "+ New user" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "+ New user" })).toHaveFocus();
  });
});

describe("Drawer · closed element", () => {
  it("stays in the tree while closed, flex only when open, tagged with its side", () => {
    const { container } = render(
      <Drawer open={false} onClose={() => {}} title="New user" side="left">
        body
      </Drawer>,
    );
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(false);
    expect(dialog.classList).toContain("open:flex");
    expect(dialog.classList).not.toContain("flex");
    expect(dialog).toHaveAttribute("data-side", "left");
  });

  it("gives its × a 24px target with press feedback", async () => {
    render(
      <Drawer open onClose={() => {}} title="New user">
        body
      </Drawer>,
    );
    const close = screen.getByRole("button", { name: "Close" });
    expect(close.classList).toContain("size-6");
    expect(close.classList).toContain("active:scale-[0.95]");
  });
});
