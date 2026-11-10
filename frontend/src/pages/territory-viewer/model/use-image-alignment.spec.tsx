import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CalibrationPair } from "@/entities/site-plan";
import { runRegistration } from "@/widgets/viewer-canvas";
import { useImageAlignment } from "./use-image-alignment";

vi.mock("@/widgets/viewer-canvas", () => ({ runRegistration: vi.fn() }));

describe("useImageAlignment", () => {
  it("ignores an answer from the previous PDF page", async () => {
    let finish!: (value: CalibrationPair[]) => void;
    vi.mocked(runRegistration).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const proposeImagePairs = vi.fn(),
      image = {} as ImageBitmap;
    const alignment = { pairs: [], pending: null, imageProposalAllowed: true, proposeImagePairs };
    const ground = { groundAt: () => 0, fallbackY: 0 };
    const { rerender } = renderHook(
      ({ page }) =>
        useImageAlignment({
          image,
          pageSize: { width: 100, height: 100 },
          page,
          source: "hash",
          savedPage: null,
          ground,
          unitRatio: 100,
          alignment,
        }),
      { initialProps: { page: 1 } },
    );
    await waitFor(() => expect(runRegistration).toHaveBeenCalled());
    const first = finish;
    rerender({ page: 2 });
    await act(async () => first([{ pdf: { x: 1, y: 2 }, scene: { x: 3, y: 0, z: 4 }, utm: null }]));
    expect(proposeImagePairs).not.toHaveBeenCalled();
  });
});
