import * as cv from "jsfeat";

const LEVELS = 4;
const MAX_PER_LEVEL = 2000;
const PATCH = 15;
const UMAX = [15, 15, 15, 15, 14, 14, 14, 13, 13, 12, 11, 10, 9, 8, 6, 3, 0];

function orientation(image: cv.matrix_t, x: number, y: number): number {
  let mx = 0,
    my = 0;
  const center = y * image.cols + x,
    data = image.data;
  for (let u = -PATCH; u <= PATCH; u++) mx += u * data[center + u];
  for (let v = 1; v <= PATCH; v++) {
    let sum = 0;
    for (let u = -UMAX[v]; u <= UMAX[v]; u++) {
      const plus = data[center + u + v * image.cols],
        minus = data[center + u - v * image.cols];
      sum += plus - minus;
      mx += u * (plus + minus);
    }
    my += v * sum;
  }
  return Math.atan2(my, mx);
}

/** Extracts YAPE corners and oriented BRIEF descriptors at four scales. */
export function describeImage(data: Uint8Array, width: number, height: number) {
  const base = new cv.matrix_t(width, height, cv.U8_t | cv.C1_t);
  base.data.set(data);
  const points: { x: number; y: number }[] = [],
    descriptors: number[] = [];
  for (let level = 0; level < LEVELS; level++) {
    const scale = 1 / Math.SQRT2 ** level;
    const w = Math.floor(width * scale),
      h = Math.floor(height * scale);
    if (w < 40 || h < 40) break;
    const image = new cv.matrix_t(w, h, cv.U8_t | cv.C1_t);
    if (level) cv.imgproc.resample(base, image, w, h);
    else image.data.set(base.data);
    cv.imgproc.gaussian_blur(image, image, 5);
    const corners = new Proxy<cv.keypoint_t[]>([], {
      get(target, key, receiver) {
        if (typeof key === "string" && /^\d+$/u.test(key) && !target[Number(key)])
          target[Number(key)] = new cv.keypoint_t(0, 0, 0, 0, -1);
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    const count = cv.yape06.detect(image, corners, 17);
    corners.length = count;
    corners.sort((a, b) => b.score - a.score);
    const selected = corners.slice(0, MAX_PER_LEVEL);
    for (const p of selected) p.angle = orientation(image, p.x, p.y);
    const result = new cv.matrix_t(32, selected.length, cv.U8_t | cv.C1_t);
    cv.orb.describe(image, selected, selected.length, result);
    for (let i = 0; i < selected.length; i++) {
      points.push({ x: selected[i].x / scale, y: selected[i].y / scale });
      for (let j = 0; j < 8; j++) descriptors.push(result.buffer.i32[i * 8 + j]);
    }
  }
  return { points, descriptors: Uint32Array.from(descriptors) };
}
