import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

/** The class list as tokens — `hover:bg-panel-2` must not read as `bg-panel-2`. */
const classes = (el: HTMLElement) => el.className.split(/\s+/);

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
    const pill = classes(screen.getByRole("button", { name: "+ Upload" }));
    expect(pill).toContain("bg-transparent");
    // Not merely "transparent is also present": two background utilities on
    // one element are resolved by the compiled stylesheet's own source order,
    // not by clsx, so the resting ground has to be absent.
    expect(pill).not.toContain("bg-panel-2");

    rerender(<Button>+ Upload</Button>);
    expect(classes(screen.getByRole("button", { name: "+ Upload" }))).toContain("bg-panel-2");
  });

  it("keeps the raised ground on a secondary icon button too", () => {
    render(
      <Button shape="icon" aria-label="Delete">
        x
      </Button>,
    );
    expect(classes(screen.getByRole("button", { name: "Delete" }))).toContain("bg-panel-2");
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

  // jsdom computes no styles, so a class-token check is the sanctioned way to
  // pin this: a small pill (10px, padding 6×14 — every status/action pill at
  // this size) matches the design system's own Badge sm pill at 0.14em; a
  // base utility here would collide with a same-property compound elsewhere
  // and the winner would be the compiled stylesheet's source order, not this
  // test — so tracking has to live on the size compound alone.
  it("tightens tracking on a small pill to match Badge's sm pill, and leaves other sizes alone", () => {
    const { rerender } = render(
      <Button shape="pill" size="sm">
        Remove
      </Button>,
    );
    expect(classes(screen.getByRole("button", { name: "Remove" }))).toContain("tracking-[0.14em]");

    rerender(
      <Button shape="pill" size="md">
        Remove
      </Button>,
    );
    const md = classes(screen.getByRole("button", { name: "Remove" }));
    expect(md).toContain("tracking-[0.18em]");
    expect(md).not.toContain("tracking-[0.14em]");
  });
});
