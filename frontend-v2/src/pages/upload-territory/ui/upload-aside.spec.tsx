import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ARCHIVE_CHECKLIST, stagesFor } from "../model/upload-form";
import { UploadAside } from "./upload-aside";

describe("UploadAside", () => {
  it("titles the pipeline card and lists every stage with its hint", () => {
    render(<UploadAside stages={stagesFor("uploading")} checks={ARCHIVE_CHECKLIST} />);
    expect(screen.getByText("What happens next")).toBeInTheDocument();
    expect(screen.getByText("Upload → convert → viewer")).toBeInTheDocument();
    expect(screen.getByText("Chunked upload")).toBeInTheDocument();
    expect(screen.getByText("8 MB chunks, resumable")).toBeInTheDocument();
    expect(screen.getByText("Compress textures")).toBeInTheDocument();
  });

  it("names the archive checklist and every item verbatim", () => {
    render(<UploadAside stages={stagesFor("idle")} checks={ARCHIVE_CHECKLIST} />);
    expect(screen.getByText("Archive checklist")).toBeInTheDocument();
    expect(screen.getByText("Single ZIP, no nested archives")).toBeInTheDocument();
    expect(screen.getByText("Metres as units — the viewer measures in metres")).toBeInTheDocument();
  });

  it("warns that conversion keeps running after the tab closes", () => {
    render(<UploadAside stages={stagesFor("idle")} checks={ARCHIVE_CHECKLIST} />);
    expect(
      screen.getByText(
        "Conversion of a 2 GB territory takes ~3 minutes. You can close this tab — the job keeps running.",
      ),
    ).toBeInTheDocument();
  });
});
