import ReactThreeTestRenderer from "@react-three/test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LodReport } from "../ui/props";
import GltfModel from "./gltf-model";

vi.mock("@react-three/drei", async (orig) => (await import("./testing")).mockDrei(orig));

const CHAIN = [
  { lod: 0, hash: "fine", size: 10 },
  { lod: 2, hash: "coarse", size: 2 },
];

// The stream stops between the two chunks and waits for the test to let the
// second one go. React batches every update that lands in the same tick, so a
// stream that enqueues both at once renders once and the mid-download percent
// could not be observed even when the code reports it — and a stream that
// merely yields to the macrotask queue raced React's batching, which is how
// the 40 % assertion became a flake. `gate` makes the sequence the test's.
const streamOf = (chunks: Uint8Array[], gate?: Promise<void>) =>
  new ReadableStream({
    async start(c) {
      c.enqueue(chunks[0]);
      if (gate) await gate;
      for (const ch of chunks.slice(1)) c.enqueue(ch);
      c.close();
    },
  });

const stubDownload = (status = 200, gate?: Promise<void>) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      status === 200
        ? new Response(streamOf([new Uint8Array(4), new Uint8Array(6)], gate), { status })
        : new Response(null, { status }),
    ),
  );
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:fine"),
    revokeObjectURL: vi.fn(),
  });
};

const model = (
  over: { onReport?: (r: LodReport) => void; retryVersion?: number; targetLod?: number } = {},
) => (
  <GltfModel
    lods={CHAIN}
    targetLod={over.targetLod ?? 0}
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
    // The first level reported is the coarse one standing in for the target;
    // the last one, after the warmer says the blob parsed, is the target itself.
    const levels = onReport.mock.calls.map((c) => c[0] as LodReport).filter((r) => r.shown !== null);
    expect(levels[0]).toMatchObject({ shown: 2, target: 0 });
    await vi.waitFor(() =>
      expect((onReport.mock.lastCall![0] as LodReport).shown).toBe(0),
    );
  });

  it("keeps the coarse level on screen on the way back to a level already seen (0 → 2 → 0)", async () => {
    // The return trip is progressive too: the coarse level stays up while the
    // target downloads again, drei never fetches the target's asset route on
    // its own (that was a second, parallel GET of the same bytes), and the
    // coarse level — always on screen by its asset route — is never streamed
    // into a blob, which would swap its url and re-parse it mid-view.
    stubDownload();
    const drei = await import("@react-three/drei");
    vi.mocked(drei.useGLTF).mockClear();
    const onReport = vi.fn();
    const r = await ReactThreeTestRenderer.create(model({ onReport }));
    const last = () => onReport.mock.lastCall![0] as LodReport;
    await vi.waitFor(() => expect(last().shown).toBe(0));

    await r.update(model({ onReport, targetLod: 2 }));
    expect(last()).toMatchObject({ shown: 2, target: 2 });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

    const from = onReport.mock.calls.length;
    await r.update(model({ onReport, targetLod: 0 }));
    const back = onReport.mock.calls.slice(from).map((c) => c[0] as LodReport);
    expect(back[0]).toMatchObject({ shown: 2, target: 0 });
    // The finished first download is forgotten: the return counts from 0,
    // never from the old 100 % against a revoked blob.
    expect(back[0].percent).not.toBe(100);
    await vi.waitFor(() => expect(last().shown).toBe(0));
    const parsed = vi.mocked(drei.useGLTF).mock.calls.map((c) => String(c[0]));
    expect(parsed).not.toContain("/api/assets/fine");
    expect(parsed.filter((u) => u.startsWith("/api/assets/")).every((u) => u.endsWith("coarse"))).toBe(true);
  });

  it("reports no level on screen until the coarse mesh has actually mounted", async () => {
    // The strip read "LOD 2 active" for the seconds the coarse level was still
    // on the wire, over an empty scene. On screen means mounted. The target's
    // download never finishes here, so the coarse level is all there is.
    stubDownload(200, new Promise<void>(() => {}));
    const drei = await import("@react-three/drei");
    const { fakeScene } = await import("./testing");
    let arrive!: () => void;
    const pending = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    let arrived = false;
    void pending.then(() => {
      arrived = true;
    });
    vi.mocked(drei.useGLTF).mockImplementation((url) => {
      if (String(url) === "/api/assets/coarse" && !arrived) throw pending;
      return { scene: fakeScene() } as never;
    });
    const onReport = vi.fn();
    await ReactThreeTestRenderer.create(model({ onReport }));
    expect(onReport.mock.calls[0][0]).toMatchObject({ shown: null, target: 0 });

    arrive();
    await vi.waitFor(() =>
      expect(onReport.mock.calls.map((c) => (c[0] as LodReport).shown)).toContain(2),
    );
  });

  it("stops calling a level shown once its mesh is gone again (a retry that suspends)", async () => {
    // A retry remounts the same url; while it suspends nothing is on screen,
    // and the strip must not keep saying "LOD 2 active" over the skeleton.
    stubDownload(200, new Promise<void>(() => {}));
    const drei = await import("@react-three/drei");
    const { fakeScene } = await import("./testing");
    let hang = false;
    vi.mocked(drei.useGLTF).mockImplementation((url) => {
      if (hang && String(url) === "/api/assets/coarse") throw new Promise(() => {});
      return { scene: fakeScene() } as never;
    });
    const onReport = vi.fn();
    const r = await ReactThreeTestRenderer.create(model({ onReport }));
    const last = () => onReport.mock.lastCall![0] as LodReport;
    await vi.waitFor(() => expect(last().shown).toBe(2));
    hang = true;
    await r.update(model({ onReport, retryVersion: 1 }));
    await vi.waitFor(() => expect(last().shown).toBeNull());
  });

  it("reports bytes so far against the target's size while the coarse level is up", async () => {
    // *While* the bytes are on the wire, not only once they are in. The stub
    // streams 4 of the target's 10, waits for this test to say so, then the
    // other 6 — so the 40 % report has to have been made before the download
    // can finish. The page's whole loading state (chip, percent, progress
    // line, dimmed tiles) hangs off that percent being non-null, and the blob
    // url does not exist yet at that point.
    // Not Promise.withResolvers: the app targets es2023 and this one spec is
    // no reason to widen its lib.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubDownload(200, gate);
    const onReport = vi.fn();
    await ReactThreeTestRenderer.create(model({ onReport }));

    const percents = () => onReport.mock.calls.map((c) => (c[0] as LodReport).percent);
    await vi.waitFor(() => expect(percents()).toContain(40));
    expect(percents()).not.toContain(100);

    release();
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
