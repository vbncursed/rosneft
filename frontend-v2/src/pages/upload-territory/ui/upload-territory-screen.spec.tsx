import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ARCHIVE_CHECKLIST, stagesFor } from "../model/upload-form";
import type { UploadTerritoryState } from "../model/use-upload-territory";
import { UploadTerritoryScreen } from "./upload-territory-screen";

const { useUploadTerritory } = vi.hoisted(() => ({ useUploadTerritory: vi.fn() }));
vi.mock("../model/use-upload-territory", () => ({ useUploadTerritory }));

const state = (over: Partial<UploadTerritoryState> = {}): UploadTerritoryState => ({
  phase: "idle",
  file: null,
  form: { title: "", description: "", panoramaUrl: "" },
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

describe("UploadTerritoryScreen", () => {
  it("renders the page from the hook's state", () => {
    useUploadTerritory.mockReturnValue(state());
    render(<UploadTerritoryScreen />);
    expect(screen.getByRole("heading", { level: 1, name: "New territory" })).toBeInTheDocument();
  });

  it("shows the picked file from the hook", () => {
    useUploadTerritory.mockReturnValue(
      state({ phase: "picked", file: new File(["x"], "a.zip"), form: { title: "A", description: "", panoramaUrl: "" }, slug: "a" }),
    );
    render(<UploadTerritoryScreen />);
    expect(screen.getByText("a.zip")).toBeInTheDocument();
    expect(screen.getByText("a")).toBeInTheDocument();
  });

  it("gates the whole form on the hook's canUpload", () => {
    useUploadTerritory.mockReturnValue(state({ canUpload: false }));
    render(<UploadTerritoryScreen />);
    expect(screen.getByText("Uploading a territory needs territory:write.")).toBeInTheDocument();
  });
});
