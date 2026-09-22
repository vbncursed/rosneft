import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { hoverTip } from "@/shared/ui/tooltip/testing";

/** The class list as tokens — `hover:bg-panel-2` must not read as `bg-panel-2`. */
const classes = (el: HTMLElement) => el.className.split(/\s+/);

describe("Button", () => {
  it("defaults to type=button so it never submits a surrounding form by accident", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("type")).toBe("button");
  });

  // The guided tour focuses its Next button on every step, so a caller has to
  // be able to reach the DOM node. React 19 takes `ref` as a plain prop; the
  // props type has to say so or it never reaches the element.
  it("forwards a ref to the underlying button element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Next</Button>);
    expect(ref.current).toBe(screen.getByRole("button", { name: "Next" }));
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

  // jsdom computes no styles, so the press feedback is pinned by its tokens:
  // the button answers pointer-down, not only the click that follows release.
  it("scales down on press, and animates scale alongside the colours", () => {
    render(<Button>Save</Button>);
    const cls = classes(screen.getByRole("button", { name: "Save" }));
    expect(cls).toContain("enabled:active:scale-[0.97]");
    expect(cls).toContain("transition-[color,background-color,border-color,scale]");
    expect(cls).toContain("ease-out");
    expect(cls).not.toContain("transition-colors");
  });

  it("draws a 24px icon button at size xs, pressed a little deeper", () => {
    render(
      <Button shape="icon" size="xs" aria-label="Close">
        ×
      </Button>,
    );
    const cls = classes(screen.getByRole("button", { name: "Close" }));
    expect(cls).toEqual(expect.arrayContaining(["size-6", "rounded-[6px]", "text-xs", "enabled:active:scale-95"]));
    // One property, one place: the size decides the press depth, nothing else.
    expect(cls).not.toContain("enabled:active:scale-[0.97]");
    expect(cls).not.toContain("size-8");
  });

  // The spinner used to be inserted beside the label, so a loading button grew
  // by its width and shifted everything next to it.
  it("keeps its width while loading: the spinner floats over a hidden label", () => {
    const { rerender } = render(<Button>Sign in</Button>);
    const label = screen.getByText("Sign in");
    expect(classes(label)).not.toContain("opacity-0");

    rerender(<Button loading>Sign in</Button>);
    expect(classes(screen.getByText("Sign in"))).toEqual(expect.arrayContaining(["opacity-0", "blur-[2px]"]));
    expect(classes(screen.getByTestId("button-spinner").parentElement!)).toContain("absolute");
    expect(classes(screen.getByRole("button", { name: "Sign in" }))).toContain("relative");
  });

  // Faster reads as quicker; under reduced motion it slows rather than freezing
  // into an open arc that reads as a broken icon.
  it("spins at 700ms, and slowly rather than not at all under reduced motion", () => {
    render(<Button loading>Save</Button>);
    const cls = classes(screen.getByTestId("button-spinner"));
    expect(cls).toEqual(
      expect.arrayContaining(["animate-spin", "[animation-duration:700ms]", "motion-reduce:[animation-duration:2s]"]),
    );
    expect(cls).not.toContain("motion-reduce:animate-none");
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
    const { rerender } = render(<Button shape="pill">Upload</Button>);
    const pill = classes(screen.getByRole("button", { name: "Upload" }));
    expect(pill).toContain("bg-transparent");
    // Not merely "transparent is also present": two background utilities on
    // one element are resolved by the compiled stylesheet's own source order,
    // not by clsx, so the resting ground has to be absent.
    expect(pill).not.toContain("bg-panel-2");

    rerender(<Button>Upload</Button>);
    expect(classes(screen.getByRole("button", { name: "Upload" }))).toContain("bg-panel-2");
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

  // Loading is work in progress, not unavailability: only a disabled button dims.
  it("dims when disabled but not while loading", () => {
    const { rerender } = render(<Button loading>Save</Button>);
    const cls = () => classes(screen.getByRole("button", { name: "Save" }));
    expect(cls()).not.toContain("opacity-55");
    expect(cls()).not.toContain("disabled:opacity-55");

    rerender(<Button disabled>Save</Button>);
    expect(cls()).toContain("opacity-55");
  });
});

describe("Button · tooltip", () => {
  it("names an icon button from its aria-label, in exactly one tooltip", () => {
    render(
      <Button shape="icon" aria-label="Delete model">
        x
      </Button>,
    );
    const tip = hoverTip(screen.getByRole("button", { name: "Delete model" }));
    expect(tip).toHaveTextContent("Delete model");
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
  });

  it("stays quiet when an icon button opts out", () => {
    render(
      <Button shape="icon" aria-label="Delete model" tooltip={false}>
        x
      </Button>,
    );
    expect(hoverTip(screen.getByRole("button", { name: "Delete model" }))).toBeNull();
  });

  it("shows the label it is given over the aria-label", () => {
    render(
      <Button shape="icon" aria-label="Delete model" tooltip={{ label: "In use on 2 territories" }}>
        x
      </Button>,
    );
    expect(hoverTip(screen.getByRole("button", { name: "Delete model" }))).toHaveTextContent("In use on 2 territories");
  });

  it("shows nothing on a labelled control unless asked, and the given label when asked", () => {
    const { rerender } = render(<Button>Save</Button>);
    expect(hoverTip(screen.getByRole("button", { name: "Save" }))).toBeNull();
    rerender(<Button tooltip={{ label: "Saves the draft", shortcut: "S" }}>Save</Button>);
    const tip = hoverTip(screen.getByRole("button", { name: "Save" }));
    expect(tip).toHaveTextContent("Saves the draft");
    expect(tip?.querySelector("kbd")).toHaveTextContent("S");
  });

  it("still names a disabled icon button", () => {
    render(
      <Button shape="icon" aria-label="Delete model" disabled>
        x
      </Button>,
    );
    const wrapper = screen.getByRole("button", { name: "Delete model" }).parentElement!;
    expect(hoverTip(wrapper)).toHaveTextContent("Delete model");
  });
});
