import { describe, expect, it } from "vitest";
import { stripImportQuery } from "./pdfjs-dev.ts";

describe("stripImportQuery", () => {
  it.each([
    ["/pdfjs/build/pdf.mjs?import", "/pdfjs/build/pdf.mjs"],
    ["/pdfjs/build/pdf.worker.mjs?import", "/pdfjs/build/pdf.worker.mjs"],
    ["/pdfjs/build/pdf.mjs?import&t=123", "/pdfjs/build/pdf.mjs?t=123"],
    ["/pdfjs/build/pdf.mjs?t=123&import", "/pdfjs/build/pdf.mjs?t=123"],
    ["/pdfjs/build/pdf.mjs?v=1", "/pdfjs/build/pdf.mjs?v=1"],
    ["/pdfjs/build/pdf.mjs", "/pdfjs/build/pdf.mjs"],
    ["/src/x.ts?import", "/src/x.ts?import"],
    ["/api/pdfjs/x.mjs?import", "/api/pdfjs/x.mjs?import"],
  ])("%s -> %s", (input, expected) => {
    expect(stripImportQuery(input)).toBe(expected);
  });
});
