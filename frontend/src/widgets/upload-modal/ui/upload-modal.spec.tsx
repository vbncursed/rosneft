import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FileUploadState } from "@/entities/upload";
import { UploadModal, type UploadModalProps } from "./upload-modal";
import { hoverTip } from "@/shared/ui/tooltip/testing";

const file = (name = "pump-house-south.jpg", size = 25_795_788) =>
  ({ name, size, type: "image/jpeg" }) as unknown as File;

const IDLE: FileUploadState = { stage: "idle", file: null };

const handlers = () => ({
  onTitle: vi.fn(),
  onPick: vi.fn(),
  onClear: vi.fn(),
  onSubmit: vi.fn(),
  onCancelUpload: vi.fn(),
  onClose: vi.fn(),
});

function draw(over: Partial<UploadModalProps> = {}) {
  const spies = handlers();
  const props: UploadModalProps = {
    open: true,
    kind: "panorama",
    territoryTitle: "Refinery Block C",
    upload: IDLE,
    title: "",
    canSubmit: false,
    gps: { checked: true, onChange: vi.fn() },
    ...spies,
    ...over,
  };
  render(<UploadModal {...props} />);
  return { ...spies, props };
}

describe("UploadModal", () => {
  it("renders nothing while closed", () => {
    draw({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks for one equirect photo for the named territory", () => {
    draw();

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Add a panorama to Refinery Block C",
    );
    // The heading names the dialog, so the × sits beside it and not in it.
    expect(
      screen.getByRole("dialog", { name: "Add a panorama to Refinery Block C" }),
    ).toBeInTheDocument();
    const input = screen.getByLabelText("Drop one equirectangular photo here") as HTMLInputElement;
    expect(input.accept).toBe(".jpg,.jpeg,.png");
    expect(screen.getByText("JPG or PNG · 2:1 ratio · single file")).toBeInTheDocument();
    expect(screen.getByText("Choose file")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveAttribute(
      "placeholder",
      "e.g. Pump house, south wall",
    );
    expect(
      screen.getByRole("checkbox", { name: "Place from the photo's GPS when present" }),
    ).toBeChecked();
    expect(screen.getByRole("button", { name: "Upload panorama" })).toBeDisabled();
  });

  // showModal() focuses the [autofocus] descendant, else the first focusable
  // one — the × beside the heading. React's autoFocus writes no attribute, so
  // the first thing to do is marked on the DOM.
  it("opens on the drop zone, not on the way out", () => {
    draw();
    const zone = screen.getByText("Choose file").closest("label")!;
    expect(zone).toHaveAttribute("autofocus");
    expect(screen.getByLabelText("Title")).not.toHaveAttribute("autofocus");
    expect(screen.getByRole("button", { name: "Close panorama upload" })).not.toHaveAttribute(
      "autofocus",
    );
  });

  it("opens on the title once a file is already chosen", () => {
    draw({ upload: { stage: "picked", file: file() } });
    expect(screen.getByLabelText("Title")).toHaveAttribute("autofocus");
  });

  // Reopened mid-upload the title is read-only: a caret in a field that
  // takes no typing is not the first thing to do.
  it("does not open on the title while it is read-only", () => {
    draw({
      title: "Pump house",
      upload: { stage: "uploading", file: file(), percent: 38, label: "Reading EXIF · 38 %" },
    });
    expect(screen.getByLabelText("Title")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Title")).not.toHaveAttribute("autofocus");
  });

  it("presses its close button on pointer-down", () => {
    draw();
    expect(screen.getByRole("button", { name: "Close panorama upload" })).toHaveClass(
      "active:scale-95",
      "transition-[color,background-color,border-color,scale]",
    );
  });

  it("closes from the button named after the upload it abandons", async () => {
    const { onClose } = draw();

    await userEvent.click(screen.getByRole("button", { name: "Close panorama upload" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hands the chosen file over and reports what the reader types", async () => {
    const { onPick, onTitle } = draw();
    const chosen = new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg");

    await userEvent.upload(screen.getByLabelText("Drop one equirectangular photo here"), chosen);
    await userEvent.type(screen.getByLabelText("Title"), "P");

    expect(onPick).toHaveBeenCalledWith([chosen]);
    expect(onTitle).toHaveBeenCalledWith("P");
  });

  it("submits once the title and the photo are both in", async () => {
    const { onSubmit } = draw({
      canSubmit: true,
      title: "Pump house, south wall",
      upload: { stage: "picked", file: file() },
    });

    await userEvent.click(screen.getByRole("button", { name: "Upload panorama" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("asks for one PDF, and nothing about GPS — a document has no anchor", () => {
    draw({ kind: "document", gps: undefined });

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Add a document to Refinery Block C",
    );
    const input = screen.getByLabelText("Drop one PDF here") as HTMLInputElement;
    expect(input.accept).toBe(".pdf");
    expect(screen.getByText("PDF · single file · shown as a viewport overlay")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveAttribute("placeholder", "e.g. Fire safety zones");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Upload document" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close document upload" })).toBeInTheDocument();
  });

  it("keeps the drop zone and says why the file was refused", () => {
    draw({
      upload: { stage: "refused", file: null, reason: "Please choose an equirectangular JPG or PNG image." },
    });

    expect(screen.getByLabelText("Drop one equirectangular photo here")).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Please choose an equirectangular JPG or PNG image.");
    expect(alert.className).toContain("text-bad");
    expect(screen.queryByText("JPG or PNG · 2:1 ratio · single file")).toBeNull();
  });

  it("shows the chosen file instead of the drop zone, and takes it back on Replace", async () => {
    const { onClear } = draw({ upload: { stage: "picked", file: file() } });

    expect(screen.queryByLabelText("Drop one equirectangular photo here")).toBeNull();
    expect(screen.getByText("pump-house-south.jpg")).toBeInTheDocument();
    expect(screen.getByText("24.6 MB")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("draws the progress, freezes the form and offers to cancel while the bytes travel", async () => {
    const { onCancelUpload } = draw({
      title: "Pump house, south wall",
      canSubmit: false,
      upload: { stage: "uploading", file: file(), percent: 38, label: "Reading EXIF · 38 %" },
    });

    expect(screen.getByRole("progressbar", { name: "Reading EXIF · 38 %" })).toHaveAttribute(
      "aria-valuenow",
      "38",
    );
    // Read-only, not disabled: a disabled field greys its value to the
    // placeholder's colour, and the reader cannot tell the title was kept.
    expect(screen.getByLabelText("Title")).not.toBeDisabled();
    expect(screen.getByLabelText("Title")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Title")).toHaveValue("Pump house, south wall");
    expect(
      screen.getByRole("checkbox", { name: "Place from the photo's GPS when present" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Uploading…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Replace" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    expect(onCancelUpload).toHaveBeenCalledTimes(1);
  });

  it("aborts the upload on the way out, whichever way the reader leaves", async () => {
    const { onCancelUpload, onClose } = draw({
      upload: { stage: "uploading", file: file(), percent: 38, label: "Reading EXIF · 38 %" },
    });

    // Leaving without aborting lets the bytes land and the row appear minutes
    // later in a panel the reader has already walked away from.
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelUpload).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Close panorama upload" }));
    expect(onCancelUpload).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(2);

    await userEvent.keyboard("{Escape}");
    expect(onCancelUpload).toHaveBeenCalledTimes(3);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("aborts nothing when the reader leaves before a byte moves", async () => {
    const { onCancelUpload, onClose } = draw({ upload: { stage: "picked", file: file() } });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCancelUpload).not.toHaveBeenCalled();
  });

  it("offers no cancel once the bytes are in and the row is being written", () => {
    draw({ upload: { stage: "creating", file: file() } });

    expect(screen.getByRole("button", { name: "Uploading…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Cancel upload" })).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});

describe("UploadModal · tooltip", () => {
  it("names its close button in a tooltip, not a native title", () => {
    draw();
    const close = screen.getByRole("button", { name: "Close panorama upload" });
    expect(close).not.toHaveAttribute("title");
    expect(hoverTip(close)).toHaveTextContent("Close panorama upload");
  });
});
