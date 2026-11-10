import { describe, expect, it, vi } from "vitest";

describe("registration worker", () => {
  it("returns no proposal for blank pictures", async () => {
    const post = vi.spyOn(self, "postMessage").mockImplementation(() => undefined);
    await import("./registration-worker");
    const image = { data: new Uint8Array(64 * 64), width: 64, height: 64 };
    self.dispatchEvent(
      new MessageEvent("message", {
        data: {
          source: image,
          target: image,
          geometry: {
            positions: new Float32Array(),
            uvs: new Float32Array(),
            indices: null,
            matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          },
        },
      }),
    );
    expect(post).toHaveBeenCalledWith({ matches: [], points: [] });
    self.onmessage = null;
    post.mockRestore();
  });
});
