import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StorageSection, type StorageSectionProps } from "./storage-section";

const GIB = 1024 ** 3;
const props = {
  usage: { used: 3.4 * GIB, pinned: 2 * GIB, limit: 10 * GIB },
  usageFailed: false,
  savedLoaded: true,
  saved: [
    {
      slug: "ust-kut",
      title: "Ust-Kut",
      bytes: 2 * GIB,
      savedAt: "2026-09-30T08:00:00Z",
      syncedAt: "2026-10-01T08:00:00Z",
    },
  ],
  onLimit: vi.fn(async () => {}),
  onClear: vi.fn(async () => {}),
  onRemove: vi.fn(async () => {}),
} satisfies StorageSectionProps;

describe("StorageSection", () => {
  it("says how much is used, in words", () => {
    render(<StorageSection {...props} />);
    expect(screen.getByText("3.4 GB of 10 GB used")).toBeInTheDocument();
  });

  it("lists saved territories with their size and a Remove each", async () => {
    render(<StorageSection {...props} />);
    expect(screen.getByText("Ust-Kut")).toBeInTheDocument();
    expect(screen.getByText("2 GB · saved 30 Sep 2026 · synced 1 Oct 2026")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove Ust-Kut from this device" }));
    expect(props.onRemove).not.toHaveBeenCalled();
    expect(screen.getByText("Remove Ust-Kut from this device?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(props.onRemove).toHaveBeenCalledWith("ust-kut");
  });

  it("keeps the copy when removal is cancelled", async () => {
    props.onRemove.mockClear();
    render(<StorageSection {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Ust-Kut from this device" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onRemove).not.toHaveBeenCalled();
  });

  it("marks the current limit and changes it", async () => {
    render(<StorageSection {...props} />);
    expect(screen.getByRole("radio", { name: "10 GB" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "20 GB" }));
    expect(props.onLimit).toHaveBeenCalledWith(20 * GIB);
  });

  it("asks before clearing the cache", async () => {
    render(<StorageSection {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Clear cache" }));
    expect(props.onClear).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(props.onClear).toHaveBeenCalled();
  });

  it("says when nothing is saved yet", () => {
    render(<StorageSection {...props} saved={[]} />);
    expect(screen.getByText("Nothing saved on this device yet.")).toBeInTheDocument();
  });

  it("shows the overrun when pinned territories alone exceed the limit", () => {
    render(<StorageSection {...props} usage={{ used: 12 * GIB, pinned: 12 * GIB, limit: 10 * GIB }} />);
    expect(screen.getByText(/Saved territories exceed the limit/)).toBeInTheDocument();
  });

  it("reads loading and unavailable differently", () => {
    const { rerender } = render(<StorageSection {...props} usage={null} savedLoaded={false} />);
    expect(screen.getByText("Reading storage…")).toBeInTheDocument();
    expect(screen.getByText("Reading saved territories…")).toBeInTheDocument();
    expect(screen.queryByText("Nothing saved on this device yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("Storage usage unavailable")).not.toBeInTheDocument();

    rerender(<StorageSection {...props} usage={null} usageFailed />);
    expect(screen.getByText("Storage usage unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Reading storage…")).not.toBeInTheDocument();
  });
});
