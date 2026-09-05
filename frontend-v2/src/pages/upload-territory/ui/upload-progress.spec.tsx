import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UploadProgressPanel } from "./upload-progress";

describe("UploadProgressPanel", () => {
  it("offers the idle Upload territory button, enabled only when told to", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <UploadProgressPanel phase="idle" canSubmit={false} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Upload territory" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

    rerender(<UploadProgressPanel phase="picked" canSubmit onSubmit={onSubmit} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Upload territory" })).toBeEnabled();
  });

  it("draws the progress bar and its readouts while uploading", () => {
    render(
      <UploadProgressPanel
        phase="uploading"
        progress={{ value: 64, header: "64% · 1.4 GB / 2.2 GB · ~3 min", stats: ["chunk 197 / 308", "8 MB chunks", "23 MB/s", "resumable"] }}
        canSubmit={false}
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

  it("busies the button and offers Cancel while uploading or finalizing", async () => {
    const onCancel = vi.fn();
    render(<UploadProgressPanel phase="finalizing" canSubmit={false} onSubmit={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByRole("button", { name: "Uploading…" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("submits from the idle button", async () => {
    const onSubmit = vi.fn();
    render(<UploadProgressPanel phase="picked" canSubmit onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Upload territory" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
