import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

  it("carries the warning triangle by default and takes another glyph", () => {
    const { container, rerender } = render(<Callout tone="bad">w</Callout>);
    expect(container.querySelector("svg")).toBeInTheDocument();

    rerender(
      <Callout tone="ok" icon="eye">
        seen
      </Callout>,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
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
  });
});
