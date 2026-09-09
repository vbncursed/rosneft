import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Toast } from "./toast";

describe("Toast", () => {
  it("interrupts for an error and waits its turn for info", () => {
    const { rerender } = render(<Toast tone="error">Conversion failed</Toast>);
    expect(screen.getByRole("alert")).toHaveTextContent("Conversion failed");

    rerender(<Toast tone="info">mesh-worker is processing</Toast>);
    expect(screen.getByRole("status")).toHaveTextContent("mesh-worker is processing");
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
});
