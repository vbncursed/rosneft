declare module "jsfeat" {
  export const U8_t: number;
  export const C1_t: number;
  export class matrix_t {
    constructor(cols: number, rows: number, type: number);
    cols: number;
    rows: number;
    data: Uint8Array;
    buffer: { i32: Int32Array };
  }
  export class keypoint_t {
    constructor(x: number, y: number, score: number, level: number, angle: number);
    x: number;
    y: number;
    score: number;
    angle: number;
  }
  export const imgproc: {
    resample(src: matrix_t, dst: matrix_t, width: number, height: number): void;
    gaussian_blur(src: matrix_t, dst: matrix_t, size: number): void;
  };
  export const yape06: { detect(image: matrix_t, points: keypoint_t[], border: number): number };
  export const orb: { describe(image: matrix_t, points: keypoint_t[], count: number, out: matrix_t): void };
}
