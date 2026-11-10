import { selectRegistrationPairs, type CalibrationPair, type Pt } from "@/entities/site-plan";
import type { Ground } from "../three/ground-probe";

type WorkerResult = { matches: { source: Pt }[]; points: ({ x: number; y: number; z: number } | null)[] };

function pageImage(image: ImageBitmap) {
  const scale = Math.min(1, 2048 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const data = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < data.length; i++)
    data[i] = Math.round(rgba[4 * i] * 0.299 + rgba[4 * i + 1] * 0.587 + rgba[4 * i + 2] * 0.114);
  return { data, width: canvas.width, height: canvas.height };
}

/** Computes a draft only. Caller owns cancellation when the document or page changes. */
async function runOnce(
  image: ImageBitmap,
  page: { width: number; height: number },
  ground: Ground,
  unitRatio: number,
  signal: AbortSignal,
): Promise<CalibrationPair[] | null> {
  if (signal.aborted) return [];
  const capture = ground.registration?.();
  if (!capture) return [];
  let worker: Worker | null = null;
  try {
    const source = pageImage(image);
    worker = new Worker(new URL("../three/registration-worker.ts", import.meta.url), { type: "module" });
    const active = worker;
    const result = await new Promise<WorkerResult | null>((resolve) => {
      const timeout = setTimeout(() => finish(null), 30000);
      const finish = (value: WorkerResult | null) => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        resolve(value);
      };
      const abort = () => finish(null);
      signal.addEventListener("abort", abort, { once: true });
      active.onmessage = (event: MessageEvent<WorkerResult>) => finish(event.data);
      active.onerror = () => finish(null);
      const { geometry, image: target } = capture;
      const transfer: ArrayBuffer[] = [
        source.data.buffer,
        target.data.buffer,
        geometry.positions.buffer,
        geometry.uvs.buffer,
      ] as ArrayBuffer[];
      if (geometry.indices) transfer.push(geometry.indices.buffer as ArrayBuffer);
      active.postMessage({ source, target, geometry }, transfer);
    });
    if (!result || signal.aborted || result.matches.length !== result.points.length) return [];
    if (!capture.isCurrent()) return null;
    const pairs = result.matches.flatMap((m, i) => {
      const p = result.points[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return [];
      const y = ground.groundAt(p.x, p.z);
      if (y === null) return [];
      return [
        {
          pdf: { x: (m.source.x * page.width) / source.width, y: (m.source.y * page.height) / source.height },
          scene: { x: p.x, y, z: p.z },
          utm: null,
        },
      ];
    });
    return selectRegistrationPairs(pairs, page, unitRatio);
  } catch {
    return [];
  } finally {
    worker?.terminate();
  }
}

/** Retry a changed LOD at most twice; all other failures leave manual alignment available. */
export async function runRegistration(
  image: ImageBitmap,
  page: { width: number; height: number },
  ground: Ground,
  unitRatio: number,
  signal: AbortSignal,
): Promise<CalibrationPair[]> {
  for (let attempt = 0; attempt < 3 && !signal.aborted; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- a stale mesh must be recaptured after the preceding worker ends
    const result = await runOnce(image, page, ground, unitRatio, signal);
    if (result !== null) return result;
  }
  return [];
}
