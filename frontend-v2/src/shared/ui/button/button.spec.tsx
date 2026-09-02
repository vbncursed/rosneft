import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("defaults to type=button so it never submits a surrounding form by accident", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("type")).toBe("button");
  });

  it("fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Open</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("blocks clicks while loading and marks itself busy", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Uploading</Button>);

    const btn = screen.getByRole("button", { name: /Uploading/ });
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByTestId("button-spinner")).toBeDefined();

    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("blocks clicks while disabled", async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Delete</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("names an icon-only button for assistive tech", () => {
    render(
      <Button shape="icon" aria-label="More actions">
        ?
      </Button>,
    );
    expect(screen.getByRole("button", { name: "More actions" })).toBeDefined();
  });

  it("keeps a secondary pill transparent — only the control shape is raised", () => {
    const { rerender } = render(<Button shape="pill">+ Upload</Button>);
    expect(screen.getByRole("button", { name: "+ Upload" }).className).toContain("bg-transparent");

    rerender(<Button>+ Upload</Button>);
    expect(screen.getByRole("button", { name: "+ Upload" }).className).toContain("bg-panel-2");
  });

  it("offers a success variant for a confirming action", () => {
    render(<Button variant="success">I saved them</Button>);
    const cls = screen.getByRole("button", { name: "I saved them" }).className;
    expect(cls).toContain("border-ok");
    expect(cls).toContain("bg-ok-soft");
    expect(cls).toContain("text-ok");
  });

  it("applies the variant and shape classes", () => {
    render(
      <Button variant="danger" shape="pill">
        Delete
      </Button>,
    );
    const cls = screen.getByRole("button", { name: "Delete" }).className;
    expect(cls).toContain("border-bad");
    expect(cls).toContain("rounded-full");
    expect(cls).toContain("font-mono");
  });
});
