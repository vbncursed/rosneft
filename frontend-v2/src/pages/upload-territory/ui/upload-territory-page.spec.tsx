import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ARCHIVE_CHECKLIST, stagesFor, type UploadForm } from "../model/upload-form";
import { UploadTerritoryPage, type UploadTerritoryPageProps } from "./upload-territory-page";

const form = (over: Partial<UploadForm> = {}): UploadForm => ({
  title: "",
  description: "",
  panoramaUrl: "",
  ...over,
});

const props = (over: Partial<UploadTerritoryPageProps> = {}): UploadTerritoryPageProps => ({
  phase: "idle",
  file: null,
  form: form(),
  onForm: vi.fn(),
  onFiles: vi.fn(),
  onReplace: vi.fn(),
  slug: "",
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
  canUpload: true,
  checks: ARCHIVE_CHECKLIST,
  stages: stagesFor("idle"),
  ...over,
});

describe("UploadTerritoryPage", () => {
  it("names the page with one h1, the back link and the lede", () => {
    render(<UploadTerritoryPage {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "New territory" })).toBeInTheDocument();
    expect(screen.getByText("Upload · single territory")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Territory catalog" })).toHaveAttribute(
      "href",
      "/territories",
    );
    expect(
      screen.getByText(
        "One ZIP per territory: OBJ + MTL + textures. Uploads in 8 MB chunks and resumes after a network drop.",
      ),
    ).toBeInTheDocument();
  });

  it("draws no chrome of its own — the shell owns the layout", () => {
    render(<UploadTerritoryPage {...props()} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("shows the drop zone with no file chosen and hands the pick to onFiles", async () => {
    const onFiles = vi.fn();
    render(<UploadTerritoryPage {...props({ onFiles })} />);
    const file = new File(["x"], "a.zip");
    const input = screen.getByLabelText("Drop a ZIP here") as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it("shows the file card once a file is chosen, and replaces it only while picked", async () => {
    const onReplace = vi.fn();
    const file = new File(["x".repeat(1024)], "refinery-block-c.zip");
    render(<UploadTerritoryPage {...props({ phase: "picked", file, onReplace })} />);
    expect(screen.getByText("refinery-block-c.zip")).toBeInTheDocument();
    expect(screen.getByText("1 KB · ZIP")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(onReplace).toHaveBeenCalledOnce();
  });

  it("hides Replace once the upload has started", () => {
    const file = new File(["x"], "a.zip");
    render(<UploadTerritoryPage {...props({ phase: "uploading", file })} />);
    expect(screen.queryByRole("button", { name: "Replace" })).not.toBeInTheDocument();
  });

  it("submits the title and description through the details panel", async () => {
    const onForm = vi.fn();
    render(<UploadTerritoryPage {...props({ onForm })} />);
    await userEvent.type(screen.getByLabelText("Title", { exact: false }), "x");
    expect(onForm).toHaveBeenCalledWith({ title: "x" });
  });

  it("shows the progress panel while uploading", () => {
    render(
      <UploadTerritoryPage
        {...props({
          phase: "uploading",
          file: new File(["x"], "a.zip"),
          progress: { value: 64, header: "64% · 1.4 GB / 2.2 GB · ~3 min", stats: ["chunk 1 / 2", "8 MB chunks", "1 MB/s", "resumable"] },
        })}
      />,
    );
    expect(screen.getByText("Uploading")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "64");
  });

  it("draws the stage list and the archive checklist in the aside", () => {
    render(<UploadTerritoryPage {...props()} />);
    expect(screen.getByText("What happens next")).toBeInTheDocument();
    expect(screen.getByText("Archive checklist")).toBeInTheDocument();
  });

  it("replaces the whole form with a callout when the viewer may not upload", () => {
    render(<UploadTerritoryPage {...props({ canUpload: false })} />);
    expect(screen.getByText("Uploading a territory needs territory:write.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Drop a ZIP here")).not.toBeInTheDocument();
    expect(screen.queryByText("What happens next")).not.toBeInTheDocument();
  });
});
