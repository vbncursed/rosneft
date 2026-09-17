import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Toast } from "./toast";

describe("Toast", () => {
  // A calm tone carries no role of its own: the host's polite live region
  // announces it, and a status inside that region would nest one in another.
  it("interrupts for an error and leaves info to the host's live region", () => {
    const { rerender } = render(<Toast tone="error">Conversion failed</Toast>);
    expect(screen.getByRole("alert")).toHaveTextContent("Conversion failed");

    rerender(<Toast tone="info">mesh-worker is processing</Toast>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("labels itself from the tone", () => {
    render(<Toast tone="success">Passkey added.</Toast>);
    expect(screen.getByText("Success")).toBeInTheDocument();
  });

  it("takes an explicit label over the tone default", () => {
    render(<Toast tone="warning" label="Heads up">2FA status unavailable</Toast>);
    expect(screen.getByText("Heads up")).toBeInTheDocument();
    expect(screen.queryByText("Warning")).not.toBeInTheDocument();
  });

  it("shows a dismiss control only when it can act", async () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Toast tone="info">Sticky</Toast>);
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();

    rerender(
      <Toast tone="info" onDismiss={onDismiss}>
        Sticky
      </Toast>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("draws its action as a named button that runs it", async () => {
    const onClick = vi.fn();
    render(
      <Toast tone="error" action={{ label: "Retry", name: "Retry: Not saved", onClick }}>
        Not saved
      </Toast>,
    );
    const button = screen.getByRole("button", { name: "Retry: Not saved" });
    expect(button).toHaveTextContent("Retry");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  // Two stacked toasts must not both name their button "Dismiss" — a screen
  // reader cannot tell them apart.
  it("takes an explicit label for its dismiss button", () => {
    render(
      <Toast tone="info" onDismiss={() => {}} dismissLabel="Dismiss: Saved">
        Saved
      </Toast>,
    );
    expect(screen.getByRole("button", { name: "Dismiss: Saved" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });

  // The glyph alone was a 10×24 target; WCAG 2.5.8 asks for 24×24.
  it("gives its dismiss glyph a 24px target that presses", () => {
    render(
      <Toast tone="info" onDismiss={vi.fn()}>
        Saved.
      </Toast>,
    );
    const cls = screen.getByRole("button", { name: "Dismiss" }).className.split(/\s+/);
    expect(cls).toEqual(
      expect.arrayContaining([
        "flex",
        "size-6",
        "items-center",
        "justify-center",
        "active:scale-95",
        "transition-[color,scale]",
        "ease-out",
      ]),
    );
    expect(cls).not.toContain("p-0");
  });
});
