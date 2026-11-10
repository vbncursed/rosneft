import { apply, mul, type Matrix, type Pt } from "./geometry";

export interface PagePath {
  points: Pt[];
  closed: boolean;
  paint: "stroke" | "fill" | "fillStroke";
  stroke: string | null;
  fill: string | null;
  lineWidth: number;
}

type OpList = { fnArray: number[]; argsArray: unknown[] };
type Paint = { paint: PagePath["paint"]; close: boolean };

// pdf.js path codes inside a constructPath: how many numbers follow each.
const CLOSE = 4;
const ARGS: Record<number, number> = { 0: 2, 1: 2, 2: 6, 3: 4, 4: 0 };

const PAINTS: Record<string, Paint> = {
  stroke: { paint: "stroke", close: false },
  closeStroke: { paint: "stroke", close: true },
  fill: { paint: "fill", close: true },
  eoFill: { paint: "fill", close: true },
  fillStroke: { paint: "fillStroke", close: true },
  eoFillStroke: { paint: "fillStroke", close: true },
  closeFillStroke: { paint: "fillStroke", close: true },
  closeEOFillStroke: { paint: "fillStroke", close: true },
};

// shortcut: curves keep their control points as vertices (never flattened);
// a curved subpath therefore never has the four vertices of a rectangle.
function subpaths(codes: ArrayLike<number>, m: Matrix): { points: Pt[]; closed: boolean }[] {
  const subs: { points: Pt[]; closed: boolean }[] = [];
  let cur: { points: Pt[]; closed: boolean } | null = null;
  for (let k = 0; k < codes.length;) {
    const code = codes[k];
    const n = ARGS[code];
    if (n === undefined) break;
    if (code === CLOSE) {
      if (cur) cur.closed = true;
    } else {
      if (code === 0 || !cur) {
        cur = { points: [], closed: false };
        subs.push(cur);
      }
      for (let j = 0; j < n; j += 2) cur.points.push(apply(m, codes[k + 1 + j], codes[k + 2 + j]));
    }
    k += 1 + n;
  }
  return subs;
}

type State = { ctm: Matrix; stack: Matrix[]; stroke: string | null; fill: string | null; lineWidth: number };

function updateTransform(state: State, fn: number, args: never, ops: Record<string, number>): boolean {
  if (fn === ops.save) state.stack.push(state.ctm);
  else if (fn === ops.restore) state.ctm = state.stack.pop() ?? state.ctm;
  else if (fn === ops.transform) state.ctm = mul(state.ctm, args);
  else return false;
  return true;
}

function updatePaint(state: State, fn: number, args: never, ops: Record<string, number>): boolean {
  if (fn === ops.setStrokeRGBColor) state.stroke = (args as string[])[0] ?? null;
  else if (fn === ops.setFillRGBColor) state.fill = (args as string[])[0] ?? null;
  else if (fn === ops.setLineWidth) state.lineWidth = (args as number[])[0] ?? state.lineWidth;
  else return false;
  return true;
}

function paintedPaths(args: never, paints: Map<number, Paint>, state: State, viewport: number[]): PagePath[] {
  const [code, [codes]] = args as [number, [ArrayLike<number> | undefined]];
  const kind = paints.get(code);
  if (!kind || !codes) return [];
  return subpaths(codes, mul(viewport, state.ctm)).map((s) => ({
    points: s.points,
    closed: s.closed || kind.close,
    paint: kind.paint,
    stroke: kind.paint === "fill" ? null : state.stroke,
    fill: kind.paint === "stroke" ? null : state.fill,
    lineWidth: state.lineWidth,
  }));
}

// extractPaths replays a pdf.js operator list and returns every painted subpath
// in top-down page points (viewport applied).
export function extractPaths(opList: OpList, ops: Record<string, number>, viewport: number[]): PagePath[] {
  const paints = new Map<number, Paint>(Object.entries(PAINTS).map(([name, p]) => [ops[name], p]));
  const state: State = { ctm: [1, 0, 0, 1, 0, 0], stack: [], stroke: null, fill: null, lineWidth: 1 };
  const out: PagePath[] = [];
  opList.fnArray.forEach((fn, i) => {
    const args = opList.argsArray[i] as never;
    if (!updateTransform(state, fn, args, ops) && !updatePaint(state, fn, args, ops) && fn === ops.constructPath) {
      for (const path of paintedPaths(args, paints, state, viewport)) out.push(path);
    }
  });
  return out;
}
