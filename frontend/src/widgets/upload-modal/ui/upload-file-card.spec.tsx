import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UploadFileCard } from "./upload-file-card";

const file = (name = "pump-house-south.jpg", size = 25_795_788) =>
  ({ name, size, type: "image/jpeg" }) as unknown as File;

describe("UploadFileCard", () => {
  it("names the file and its size", () => {
    render(<UploadFileCard file={file()} glyph="panorama" />);

    expect(screen.getByText("pump-house-south.jpg")).toBeInTheDocument();
    expect(screen.getByText("24.6 MB")).toBeInTheDocument();
  });

  it("offers Replace only when the caller can take the file back", async () => {
    const onReplace = vi.fn();
    const { rerender } = render(<UploadFileCard file={file()} glyph="panorama" />);
    expect(screen.queryByRole("button", { name: "Replace" })).toBeNull();

    rerender(<UploadFileCard file={file()} glyph="panorama" onReplace={onReplace} />);
    await userEvent.click(screen.getByRole("button", { name: "Replace" }));

    expect(onReplace).toHaveBeenCalledTimes(1);
  });

  it("draws the track at the percent the upload reports, and says what it is doing", () => {
    render(
      <UploadFileCard
        file={file()}
        glyph="panorama"
        progress={{ percent: 38, label: "Reading EXIF · 38 %" }}
      />,
    );

    expect(screen.getByRole("progressbar", { name: "Reading EXIF · 38 %" })).toHaveAttribute(
      "aria-valuenow",
      "38",
    );
    expect(screen.getByText("Reading EXIF · 38 %")).toBeInTheDocument();
  });

  it("draws no track while the file is only chosen", () => {
    render(<UploadFileCard file={file()} glyph="file" onReplace={() => {}} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
