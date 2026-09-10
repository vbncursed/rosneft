import ReactThreeTestRenderer from "@react-three/test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LodReport } from "../ui/props";
import GltfModel from "./gltf-model";

vi.mock("@react-three/drei", async (orig) => (await import("./testing")).mockDrei(orig));

const CHAIN = [
  { lod: 0, hash: "fine", size: 10 },
  { lod: 2, hash: "coarse", size: 2 },
];

const streamOf = (chunks: Uint8Array[]) =>
  new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      c.close();
    },
  });

const stubDownload = (status = 200) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      status === 200
        ? new Response(streamOf([new Uint8Array(4), new Uint8Array(6)]), { status })
        : new Response(null, { status }),
    ),
  );
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:fine"),
    revokeObjectURL: vi.fn(),
  });
};

const model = (over: { onReport?: (r: LodReport) => void; retryVersion?: number } = {}) => (
  <GltfModel
    lods={CHAIN}
    targetLod={0}
    retryVersion={over.retryVersion ?? 0}
    raycastable={false}
    onReport={over.onReport ?? vi.fn()}
  />
);

describe("GltfModel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("puts the coarsest level on screen first, and downloads the target behind it", async () => {
    stubDownload();
    const drei = await import("@react-three/drei");
    vi.mocked(drei.useGLTF).mockClear();
    const onReport = vi.fn();

    await ReactThreeTestRenderer.create(model({ onReport }));
    // The first thing parsed is the cheap level, straight off the asset route.
    expect(vi.mocked(drei.useGLTF).mock.calls[0][0]).toBe("/api/assets/coarse");

    // The blob the streamed download minted is what the warmer parses, so the
    // bytes travel once.
    await vi.waitFor(() =>
      expect(vi.mocked(drei.useGLTF).mock.calls.map((c) => c[0])).toContain("blob:fine"),
    );
    // The first report is the coarse level standing in for the target; the
    // last one, after the warmer says the blob parsed, is the target itself.
    expect(onReport.mock.calls[0][0]).toMatchObject({ shown: 2, target: 0 });
    await vi.waitFor(() =>
      expect((onReport.mock.lastCall![0] as LodReport).shown).toBe(0),
    );
  });

  it("reports bytes so far against the target's size while the coarse level is up", async () => {
    stubDownload();
    const onReport = vi.fn();
    await ReactThreeTestRenderer.create(model({ onReport }));
    await vi.waitFor(() => {
      const withText = onReport.mock.calls
        .map((c) => c[0] as LodReport)
        .filter((r) => r.progressText !== null);
      expect(withText.at(-1)!.percent).toBe(100);
      expect(withText.at(-1)!.progressText).toBe("0.0 / 0.0 MB");
    });
  });

  it("stays on the coarse level when the target's download is refused", async () => {
    stubDownload(502);
    const onReport = vi.fn();
    await ReactThreeTestRenderer.create(model({ onReport }));
    await vi.waitFor(() => {
      const last = onReport.mock.lastCall![0] as LodReport;
      // The target dropped out of the chain: nothing is warming, and the level
      // on screen is still the coarse one — no error card for that.
      expect(last.shown).toBe(2);
      expect(last.failure).toBeNull();
    });
  });

  it("holds the failure when the level on screen throws, and clears it on a retry", async () => {
    stubDownload();
    const drei = await import("@react-three/drei");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const swallow = (e: ErrorEvent) => e.preventDefault();
    window.addEventListener("error", swallow);
    // Not mockImplementationOnce: React retries a failed render synchronously
    // and, if the retry succeeds, never reaches the boundary at all.
    const { fakeScene } = await import("./testing");
    vi.mocked(drei.useGLTF).mockImplementation((url) => {
      if (String(url).includes("coarse")) throw { response: { status: 404 } };
      return { scene: fakeScene() } as never;
    });

    const onReport = vi.fn();
    const r = await ReactThreeTestRenderer.create(model({ onReport }));
    await vi.waitFor(() =>
      expect((onReport.mock.lastCall![0] as LodReport).failure).toEqual({
        hash: "coarse",
        status: 404,
      }),
    );

    // The asset came back; Retry is what re-arms the boundary.
    vi.mocked(drei.useGLTF).mockImplementation(() => ({ scene: fakeScene() }) as never);
    await r.update(model({ onReport, retryVersion: 1 }));
    await vi.waitFor(() => expect((onReport.mock.lastCall![0] as LodReport).failure).toBeNull());

    window.removeEventListener("error", swallow);
    quiet.mockRestore();
    vi.mocked(drei.useGLTF).mockReset();
  });

  it("renders nothing for a territory that has not been converted", async () => {
    stubDownload();
    const r = await ReactThreeTestRenderer.create(
      <GltfModel lods={[]} targetLod={0} retryVersion={0} raycastable={false} onReport={vi.fn()} />,
    );
    expect(r.scene.children).toHaveLength(0);
  });

  it("drops the blob's cache entry before the download revokes it", async () => {
    // drei keys its parsed cache by url, and a revoked blob url is never
    // re-requested — so the entry has to go with the blob.
    stubDownload();
    const drei = await import("@react-three/drei");
    vi.mocked(drei.useGLTF.clear).mockClear();
    const r = await ReactThreeTestRenderer.create(model());
    await vi.waitFor(() =>
      expect(vi.mocked(drei.useGLTF).mock.calls.map((c) => c[0])).toContain("blob:fine"),
    );
    await r.unmount();
    expect(drei.useGLTF.clear).toHaveBeenCalledWith("blob:fine");
  });
});
