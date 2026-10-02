import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { lockPdfViewer } from "./pdf-viewer-options";

const viewer = readFileSync(resolve(process.cwd(), "public/pdfjs/web/viewer.mjs"), "utf8");

const loaded = (set: (name: string, value: unknown) => void) =>
  new CustomEvent("webviewerloaded", { detail: { source: { PDFViewerApplicationOptions: { set } } } });

describe("lockPdfViewer", () => {
  it("turns scripting off and keeps stored preferences from turning it back on", () => {
    const set = vi.fn();
    lockPdfViewer(loaded(set));
    expect(set).toHaveBeenCalledWith("enableScripting", false);
    expect(set).toHaveBeenCalledWith("disablePreferences", true);
  });

  it("ignores an event that carries no viewer options", () => {
    expect(() => lockPdfViewer(new CustomEvent("webviewerloaded"))).not.toThrow();
  });
});

// A pdf.js upgrade that renames either option or stops announcing itself to the parent would turn the lock into a
// silent no-op; the vendored file is the contract.
describe("the vendored viewer.mjs still honours the lock", () => {
  it("defines both options", () => {
    expect(viewer).toMatch(/\benableScripting: \{/);
    expect(viewer).toContain("defaultOptions.disablePreferences = {");
  });
  it("announces webviewerloaded on the parent document before it runs", () => {
    expect(viewer).toContain('new CustomEvent("webviewerloaded"');
    expect(viewer).toContain("parent.document.dispatchEvent(event)");
    expect(viewer).toContain("window.PDFViewerApplicationOptions = AppOptions");
  });
});
