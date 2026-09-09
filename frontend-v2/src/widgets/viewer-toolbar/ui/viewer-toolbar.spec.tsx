import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ViewerToolbar } from "./viewer-toolbar";

const props = { onResetCamera: vi.fn(), onShowHelp: vi.fn() };

describe("ViewerToolbar", () => {
  it("is a labelled toolbar", () => {
    render(<ViewerToolbar {...props} />);
    expect(screen.getByRole("toolbar", { name: "Viewer" })).toBeInTheDocument();
  });

  it("resets the camera", async () => {
    const onResetCamera = vi.fn();
    render(<ViewerToolbar {...props} onResetCamera={onResetCamera} />);
    await userEvent.click(screen.getByRole("button", { name: "Reset camera" }));
    expect(onResetCamera).toHaveBeenCalledOnce();
  });

  it("names the icon-only help button", async () => {
    const onShowHelp = vi.fn();
    render(<ViewerToolbar {...props} onShowHelp={onShowHelp} />);
    await userEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    expect(onShowHelp).toHaveBeenCalledOnce();
  });

  it("hosts the tools it is given", () => {
    render(<ViewerToolbar {...props} tools={<button type="button">Measure</button>} />);
    expect(screen.getByRole("button", { name: "Measure" })).toBeInTheDocument();
  });

  it("offers Clear only when there is something to clear", () => {
    const { rerender } = render(<ViewerToolbar {...props} onClearMeasurements={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Clear/ })).not.toBeInTheDocument();

    rerender(<ViewerToolbar {...props} measurementCount={3} onClearMeasurements={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Clear (3)" })).toBeInTheDocument();
  });

  it("hides Clear when no handler was given, whatever the count", () => {
    render(<ViewerToolbar {...props} measurementCount={3} />);
    expect(screen.queryByRole("button", { name: /Clear/ })).not.toBeInTheDocument();
  });

  it("clears the measurements", async () => {
    const onClearMeasurements = vi.fn();
    render(
      <ViewerToolbar {...props} measurementCount={2} onClearMeasurements={onClearMeasurements} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Clear (2)" }));
    expect(onClearMeasurements).toHaveBeenCalledOnce();
  });
});
