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
  // The loader double is shared module state, so it is restored here rather
  // than at the end of each test: a failing assertion returns before its own
  // cleanup would run, and the next test then inherits the double.
  afterEach(async () => {
    vi.unstubAllGlobals();
    const drei = await import("@react-three/drei");
    vi.mocked(drei.useGLTF).mockReset();
    vi.mocked(drei.useGLTF.clear).mockReset();
  });

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

  it("stays on the coarse level when the target's download is refused, and stops counting", async () => {
    stubDownload(502);
    const onReport = vi.fn();
    await ReactThreeTestRenderer.create(model({ onReport }));
    await vi.waitFor(() => {
      const last = onReport.mock.lastCall![0] as LodReport;
      // The refused level dropped out of the chain: nothing is warming, and
      // the level on screen is still the coarse one — no error card for that.
      expect(last.shown).toBe(2);
      expect(last.failure).toBeNull();
      // And the target moved with it. Read from the raw pick instead, the chip
      // would sit at "0 %, LOD 0" forever against a level nobody is fetching.
      expect(last.target).toBe(2);
      expect(last.percent).toBeNull();
      expect(last.progressText).toBeNull();
    });
  });

  it("counts nothing for a level drei is fetching itself", async () => {
    // Three levels, and the one the blob download wants is refused: the chain
    // drops it and targets the middle level, which drei loads on its own — no
    // blob, so no warmer and no bytes. A percent there is progress that is not
    // happening.
    stubDownload(502);
    const onReport = vi.fn();
    await ReactThreeTestRenderer.create(
      <GltfModel
        lods={[
          { lod: 0, hash: "fine", size: 10 },
          { lod: 1, hash: "mid", size: 5 },
          { lod: 2, hash: "coarse", size: 2 },
        ]}
        targetLod={0}
        retryVersion={0}
        raycastable={false}
        onReport={onReport}
      />,
    );
    await vi.waitFor(() => {
      const last = onReport.mock.lastCall![0] as LodReport;
      expect(last).toMatchObject({ shown: 2, target: 1 });
      expect(last.percent).toBeNull();
      expect(last.progressText).toBeNull();
    });
  });

  it("holds the failure when the level on screen throws, and clears it on a retry", async () => {
    stubDownload();
    const drei = await import("@react-three/drei");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const swallow = (e: ErrorEvent) => e.preventDefault();
    window.addEventListener("error", swallow);
    const { fakeScene } = await import("./testing");
    // drei's useGLTF runs through suspend-react, which *caches* a rejected load
    // and re-throws it on the next suspend of the same key until someone calls
    // clear. A double that forgets its rejections cannot fail on that, and that
    // is exactly the bug that shipped: a remount threw the cached rejection
    // before a frame was drawn, so Try again could never recover.
    //
    // `refused` is the server; `cached` is suspend-react. Not
    // mockImplementationOnce: React retries a failed render synchronously and,
    // if the retry succeeds, never reaches the boundary at all.
    const refused = new Set(["/api/assets/coarse"]);
    const cached = new Set<string>();
    vi.mocked(drei.useGLTF).mockImplementation((url) => {
      const u = String(url);
      if (cached.has(u)) throw { response: { status: 404 } };
      if (refused.has(u)) {
        cached.add(u);
        throw { response: { status: 404 } };
      }
      return { scene: fakeScene() } as never;
    });
    vi.mocked(drei.useGLTF.clear).mockImplementation((url) => {
      for (const u of Array.isArray(url) ? url : [url]) cached.delete(String(u));
    });

    const onReport = vi.fn();
    const r = await ReactThreeTestRenderer.create(model({ onReport }));
    await vi.waitFor(() =>
      expect((onReport.mock.lastCall![0] as LodReport).failure).toEqual({
        hash: "coarse",
        status: 404,
      }),
    );

    // The asset came back; Retry is what re-arms the boundary — and it has to
    // evict the cached rejection on the way, or the fresh subtree throws it.
    refused.clear();
    await r.update(model({ onReport, retryVersion: 1 }));
    await vi.waitFor(() => expect((onReport.mock.lastCall![0] as LodReport).failure).toBeNull());

    window.removeEventListener("error", swallow);
    quiet.mockRestore();
  });

  it("reports once per fact, not once per render of the page above it", async () => {
    // A page that forgot its useCallback hands down a fresh arrow every render.
    // Keyed on the callback, the effect would re-report on each one — and the
    // page setting state from the report would then never stop.
    stubDownload();
    const calls: LodReport[] = [];
    const r = await ReactThreeTestRenderer.create(
      model({ onReport: (report) => calls.push(report) }),
    );
    await vi.waitFor(() => expect(calls.at(-1)!.shown).toBe(0));
    const settled = calls.length;

    await r.update(model({ onReport: (report) => calls.push(report) }));
    await r.update(model({ onReport: (report) => calls.push(report) }));
    expect(calls.length).toBe(settled);
  });

  it("renders nothing for a territory that has not been converted", async () => {
    stubDownload();
    const r = await ReactThreeTestRenderer.create(
      <GltfModel lods={[]} targetLod={0} retryVersion={0} raycastable={false} onReport={vi.fn()} />,
    );
    expect(r.scene.children).toHaveLength(0);
  });

  it("drops the blob's cache entry, which nothing else can ever reclaim", async () => {
    // drei keys its parsed cache by url and evicts nothing. The download
    // revokes the blob url first (its cleanup is declared first), so the
    // parsed scene would sit there for the life of the tab under a url no one
    // can request again.
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
