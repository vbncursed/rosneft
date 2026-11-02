// One-off: cuts a small fixture out of `site planning.pdf` for the site-plan
// specs. Run it from frontend/ with Node 24+:
//   node scripts/dump-site-plan-fixture.mjs "../site planning.pdf"
// The PDF itself is never committed; only the JSON this writes is.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/* oxlint-disable no-extend-native, no-extraneous-class -- Node lacks a few APIs pdf.js 6 expects (browsers have them); this one-off script polyfills them. */
globalThis.DOMMatrix ??= class {};
Uint8Array.prototype.toHex ??= function () {
  return Array.from(this, (b) => b.toString(16).padStart(2, "0")).join("");
};
Uint8Array.prototype.toBase64 ??= function () {
  return Buffer.from(this).toString("base64");
};
Uint8Array.fromBase64 ??= (s) => new Uint8Array(Buffer.from(s, "base64"));
Math.sumPrecise ??= (xs) => [...xs].reduce((a, b) => a + b, 0);
for (const C of [Map, WeakMap]) {
  C.prototype.getOrInsertComputed ??= function (k, f) {
    if (!this.has(k)) this.set(k, f(k));
    return this.get(k);
  };
  C.prototype.getOrInsert ??= function (k, v) {
    if (!this.has(k)) this.set(k, v);
    return this.get(k);
  };
}

const build = fileURLToPath(new URL("../public/pdfjs/build/", import.meta.url));
const pdfjs = await import(build + "pdf.mjs");
pdfjs.GlobalWorkerOptions.workerSrc = build + "pdf.worker.mjs";

const source = process.argv[2] ?? "../site planning.pdf";
const out = fileURLToPath(new URL("../src/entities/site-plan/model/__data__/mr1-plan.json", import.meta.url));
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(source)), isEvalSupported: false }).promise;
const page = await doc.getPage(1);
const view = page.getViewport({ scale: 1, rotation: 0 });
const [pageW, pageH] = [view.width, view.height];

// Page-point window (top-down) around N2 / Crane / Loading Area / the tank row.
const REGION = { x0: 880, x1: 1290, y0: 600, y1: 1270 };
const O = pdfjs.OPS;
const STATE = [O.save, O.restore, O.transform, O.setStrokeRGBColor, O.setFillRGBColor, O.setLineWidth];
const round = (v) => Math.round(v * 1e4) / 1e4;

const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

// Bounding box of a constructPath in page points, from its local coordinates.
function pageBox(path, ctm) {
  const m = mul(view.transform, ctm);
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const take = (x, y) => {
    const px = m[0] * x + m[2] * y + m[4];
    const py = m[1] * x + m[3] * y + m[5];
    [x0, y0, x1, y1] = [Math.min(x0, px), Math.min(y0, py), Math.max(x1, px), Math.max(y1, py)];
  };
  for (let k = 0; k < path.length;) {
    const c = path[k];
    if (c === 4) {
      k += 1;
    } else if (c === 0 || c === 1) {
      take(path[k + 1], path[k + 2]);
      k += 3;
    } else if (c === 3) {
      take(path[k + 3], path[k + 4]);
      k += 5;
    } else {
      take(path[k + 5], path[k + 6]);
      k += 7;
    }
  }
  return { x0, y0, x1, y1 };
}

const ol = await page.getOperatorList();
const fnArray = [];
const argsArray = [];
let ctm = [1, 0, 0, 1, 0, 0];
const stack = [];
for (let i = 0; i < ol.fnArray.length; i++) {
  const f = ol.fnArray[i];
  const a = ol.argsArray[i];
  if (f === O.save) stack.push(ctm);
  else if (f === O.restore) ctm = stack.pop();
  else if (f === O.transform) ctm = mul(ctm, a);
  if (STATE.includes(f)) {
    fnArray.push(f);
    argsArray.push(f === O.transform ? Array.from(a, round) : a);
  } else if (f === O.constructPath) {
    const path = Array.from(a[1][0] ?? []);
    if (!path.length) continue;
    const b = pageBox(path, ctm);
    const inRegion = b.x1 >= REGION.x0 && b.x0 <= REGION.x1 && b.y1 >= REGION.y0 && b.y0 <= REGION.y1;
    const isFrame = b.x1 - b.x0 > 0.9 * pageW && b.y1 - b.y0 > 0.9 * pageH;
    if (!inRegion && !isFrame) continue;
    fnArray.push(f);
    argsArray.push([a[0], [path.map(round)], null]);
  }
}

// Text: everything in the window, plus the control-point labels (ME<n>, N:/E:/Z:).
const text = await page.getTextContent();
const items = text.items
  .filter((t) => t.str.trim() !== "")
  .map((t) => ({ str: t.str, transform: t.transform.map(round) }))
  .filter((t) => {
    const x = t.transform[4];
    const y = pageH - t.transform[5];
    const near = x >= REGION.x0 && x <= REGION.x1 && y >= REGION.y0 && y <= REGION.y1;
    return near || /^(ME\d|[NEZ]\s*:)/u.test(t.str);
  });

const names = ["save", "restore", "transform", "setStrokeRGBColor", "setFillRGBColor", "setLineWidth", "constructPath"];
const paints = Object.keys(O).filter(
  (k) => /^(close)?(EO)?(fill|stroke|fillStroke|endPath)/iu.test(k) || k === "endPath",
);
const ops = Object.fromEntries([...names, ...paints].map((k) => [k, O[k]]));
const json = JSON.stringify({
  viewport: Array.from(view.transform),
  page: { width: pageW, height: pageH },
  ops,
  opList: { fnArray, argsArray },
  text: { items },
});
writeFileSync(out, json);
console.log(`${fnArray.length} ops, ${items.length} text items, ${(json.length / 1024).toFixed(0)} KB -> ${out}`);
