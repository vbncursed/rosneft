import { describe, expect, it, vi } from "vitest";
import { revealSection, sectionId } from "./reveal-section";

const now = (fn: () => void) => fn();

const dom = (found: { scrollIntoView: () => void } | null) => ({
  getElementById: vi.fn(() => found as unknown as HTMLElement | null),
});

describe("revealSection", () => {
  it("names the section the View tab marks the anchor with", () => {
    expect(sectionId("panoramas")).toBe("view-tab-panoramas");
    expect(sectionId("documents")).toBe("view-tab-documents");
  });

  it("scrolls the section to the top of the panel body", () => {
    const scrollIntoView = vi.fn();
    const root = dom({ scrollIntoView });
    revealSection("documents", root, now);

    expect(root.getElementById).toHaveBeenCalledWith("view-tab-documents");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("waits a frame — the tab it scrolls into may be mounting", () => {
    // The tile switches the panel to the View tab and unfolds it in the same
    // click; the section it is aiming at is not in the DOM until React has
    // committed that, so the look-up is deferred rather than done now.
    const scrollIntoView = vi.fn();
    const frame = vi.fn();
    revealSection("panoramas", dom({ scrollIntoView }), frame);

    expect(scrollIntoView).not.toHaveBeenCalled();
    frame.mock.calls[0][0]();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("does nothing at all when the section is not on screen", () => {
    expect(() => revealSection("panoramas", dom(null), now)).not.toThrow();
  });
});
