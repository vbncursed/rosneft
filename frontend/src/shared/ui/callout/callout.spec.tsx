import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { Icon } from "@/shared/ui/icon";
import { Callout } from "./callout";

describe("Callout", () => {
  it("shows its message", () => {
    render(<Callout tone="bad">No 2FA and no passkey — password only.</Callout>);
    expect(screen.getByText("No 2FA and no passkey — password only.")).toBeInTheDocument();
  });

  it("announces a problem as an alert, and leaves every other tone inert", () => {
    const { rerender } = render(<Callout tone="bad">Weak</Callout>);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<Callout tone="ok">Fine</Callout>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("skins each tone", () => {
    const { container, rerender } = render(<Callout tone="warn">w</Callout>);
    expect(container.firstElementChild!.className).toContain("border-warn");

    rerender(<Callout tone="accent">a</Callout>);
    expect(container.firstElementChild!.className).toContain("border-accent-line");
  });

  const glyphOf = (ui: ReactElement) => render(ui).container.querySelector("svg")!.innerHTML;

  describe("Callout · tone glyph", () => {
    it.each([
      ["bad", "close"],
      ["warn", "warning"],
      ["ok", "check"],
      ["accent", "info"],
      ["neutral", "info"],
    ] as const)("draws the %s tone's own glyph, %s", (tone, name) => {
      expect(glyphOf(<Callout tone={tone}>x</Callout>)).toBe(glyphOf(<Icon name={name} />));
    });

    it("takes another glyph over the tone's", () => {
      expect(
        glyphOf(
          <Callout tone="bad" icon="warning">
            x
          </Callout>,
        ),
      ).toBe(glyphOf(<Icon name="warning" />));
    });
  });

  describe("Callout · neutral and loading", () => {
    it("draws neutral untinted, on the raised ground", () => {
      const { container } = render(<Callout tone="neutral">Tip</Callout>);
      expect(container.firstElementChild!.className.split(/\s+/)).toEqual(
        expect.arrayContaining(["border-line-2", "bg-panel-2", "text-muted"]),
      );
    });

    it("spins for loading, ignores the icon and marks itself busy", () => {
      const { container } = render(
        <Callout tone="loading" icon="eye">
          Rebuilding…
        </Callout>,
      );
      expect(container.querySelector("svg")).toBeNull();
      expect(container.querySelector(".animate-spin")).not.toBeNull();
      expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("Callout · dismiss", () => {
    it("has no close button unless it can be dismissed", () => {
      render(<Callout tone="neutral">Tip</Callout>);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("calls onDismiss and leaves the removal to the caller", async () => {
      const onDismiss = vi.fn();
      render(
        <Callout tone="neutral" onDismiss={onDismiss} dismissLabel="Dismiss tip">
          Tip
        </Callout>,
      );
      await userEvent.click(screen.getByRole("button", { name: "Dismiss tip" }));
      expect(onDismiss).toHaveBeenCalledOnce();
      expect(screen.getByText("Tip")).toBeInTheDocument();
    });

    it("names its close button Dismiss by default", () => {
      render(
        <Callout tone="ok" onDismiss={() => {}}>
          Done
        </Callout>,
      );
      expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    });
  });

  it("keeps the icon decorative — the text carries the meaning", () => {
    const { container } = render(<Callout tone="bad">w</Callout>);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("defaults to md and switches to the start-aligned lg block on request", () => {
    const { container, rerender } = render(<Callout tone="warn">Small notice.</Callout>);
    expect(screen.getByText("Small notice.")).toBeInTheDocument();
    expect(container.firstElementChild!.className).toContain("items-center");

    rerender(
      <Callout tone="warn" size="lg">
        Bigger notice.
      </Callout>,
    );
    expect(screen.getByText("Bigger notice.")).toBeInTheDocument();
    expect(container.firstElementChild!.className).toContain("rounded-card");
  });
});

describe("Callout · title and mono", () => {
  it("prints an overline above a mono body, both in the tone", () => {
    render(
      <Callout tone="bad" size="lg" title="Worker message" mono>
        ktx2: unsupported pixel format
      </Callout>,
    );
    const overline = screen.getByText("Worker message");
    const body = screen.getByText("ktx2: unsupported pixel format");
    expect(overline.tagName).toBe("P");
    expect(body.tagName).toBe("P");
    expect(overline.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(overline.className).toContain("uppercase");
    expect(body.className).toContain("font-mono");
    expect(screen.getByRole("alert").className).toContain("text-bad");
  });

  it("keeps a plain callout one paragraph in the sans face", () => {
    const { container } = render(<Callout tone="warn">Only this.</Callout>);
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(screen.getByText("Only this.").className).not.toContain("font-mono");
  });

  it("has a note size with the smaller glyph", () => {
    const { container } = render(
      <Callout tone="warn" icon="info" size="note">
        Closing the tab does not stop the job.
      </Callout>,
    );
    expect(container.firstElementChild!.className).toContain("rounded-control-lg");
    expect(container.querySelector("svg")).toHaveAttribute("width", "14");
    // The mock sets this body at 18px over 12px text; text-xs alone gives 16.
    // leading-* writes --tw-leading, which text-xs reads — a composition, not a collision.
    expect(screen.getByText("Closing the tab does not stop the job.").className).toContain("leading-[1.5]");
  });

  it("leaves every other size on the type scale's own line-height", () => {
    render(<Callout tone="warn">Inline.</Callout>);
    expect(screen.getByText("Inline.").className).not.toContain("leading-[1.5]");
  });
});
