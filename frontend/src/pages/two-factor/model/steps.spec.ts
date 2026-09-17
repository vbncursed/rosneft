import { describe, expect, it } from "vitest";
import { steps } from "./steps";

describe("steps", () => {
  it("walks the enable flow: scanning and confirming are live, the codes are not yet", () => {
    expect(steps("enable", "confirm")).toEqual([
      { label: "1 · scan", tone: "active" },
      { label: "2 · confirm", tone: "active" },
      { label: "3 · save codes", tone: "pending" },
    ]);
  });

  it("marks the first two done once the codes are on screen", () => {
    expect(steps("enable", "codes")).toEqual([
      { label: "1 · scan", tone: "done" },
      { label: "2 · confirm", tone: "done" },
      { label: "3 · save codes", tone: "active" },
    ]);
  });

  // Regenerating never scans anything — the secret is already enrolled — so the
  // flow is two steps, not three with one permanently done.
  it("shows the regenerate flow as two steps", () => {
    expect(steps("regenerate", "confirm")).toEqual([
      { label: "1 · confirm", tone: "active" },
      { label: "2 · save codes", tone: "pending" },
    ]);
    expect(steps("regenerate", "codes")).toEqual([
      { label: "1 · confirm", tone: "done" },
      { label: "2 · save codes", tone: "active" },
    ]);
  });
});
