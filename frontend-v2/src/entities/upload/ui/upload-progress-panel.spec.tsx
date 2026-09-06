import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UploadProgressPanel } from "./upload-progress-panel";

describe("UploadProgressPanel", () => {
  it("offers the idle submit button, enabled only when told to", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <UploadProgressPanel
        busy={false}
        canSubmit={false}
        submitLabel="Upload territory"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Upload territory" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

    rerender(
      <UploadProgressPanel
        busy={false}
        canSubmit
        submitLabel="Upload territory"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Upload territory" })).toBeEnabled();
  });

  it("draws the progress bar and its readouts while busy", () => {
    render(
      <UploadProgressPanel
        busy
        progress={{ value: 64, header: "64% · 1.4 GB / 2.2 GB · ~3 min", stats: ["chunk 197 / 308", "8 MB chunks", "23 MB/s", "resumable"] }}
        canSubmit={false}
        submitLabel="Upload territory"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Uploading")).toBeInTheDocument();
    expect(screen.getByText("64% · 1.4 GB / 2.2 GB · ~3 min")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "64");
    expect(screen.getByText("chunk 197 / 308")).toBeInTheDocument();
    expect(screen.getByText("resumable")).toBeInTheDocument();
  });

  it("busies the button and offers Cancel while busy", async () => {
    const onCancel = vi.fn();
    render(
      <UploadProgressPanel
        busy
        canSubmit={false}
        submitLabel="Upload territory"
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole("button", { name: "Uploading…" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("submits from the idle button", async () => {
    const onSubmit = vi.fn();
    render(
      <UploadProgressPanel
        busy={false}
        canSubmit
        submitLabel="Upload territory"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Upload territory" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("takes its own busy/cancel labels", async () => {
    const onCancel = vi.fn();
    render(
      <UploadProgressPanel
        busy
        canSubmit={false}
        submitLabel="Replace source"
        busyLabel="Replacing…"
        cancelLabel="Cancel upload"
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole("button", { name: "Replacing…" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
