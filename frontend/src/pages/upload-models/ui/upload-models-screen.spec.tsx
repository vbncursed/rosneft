import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { batchMix, batchStats, MODEL_CHECKLIST } from "../model/batch";
import type { UploadModelsState } from "../model/use-upload-models";
import { UploadModelsScreen } from "./upload-models-screen";

const { useUploadModels } = vi.hoisted(() => ({ useUploadModels: vi.fn() }));
vi.mock("../model/use-upload-models", () => ({ useUploadModels }));

const state = (over: Partial<UploadModelsState> = {}): UploadModelsState => ({
  rows: [],
  onFiles: vi.fn(),
  onTitle: vi.fn(),
  onRemove: vi.fn(),
  onThumbnail: vi.fn(),
  onClearDone: vi.fn(),
  onRun: vi.fn(),
  onCancel: vi.fn(),
  running: false,
  mix: batchMix([]),
  stats: batchStats([]),
  checks: MODEL_CHECKLIST,
  canUpload: true,
  failedNames: [],
  ...over,
});

describe("UploadModelsScreen", () => {
  it("renders the page from the hook's state", () => {
    useUploadModels.mockReturnValue(state());
    render(<UploadModelsScreen />);
    expect(screen.getByRole("heading", { level: 1, name: "New models" })).toBeInTheDocument();
  });

  it("gates the whole form on the hook's canUpload", () => {
    useUploadModels.mockReturnValue(state({ canUpload: false }));
    render(<UploadModelsScreen />);
    expect(screen.getByText("Uploading models needs model:write.")).toBeInTheDocument();
  });
});
