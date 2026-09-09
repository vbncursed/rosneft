import { afterEach, describe, expect, it, vi } from "vitest";
import { leaveTo } from "./leave";

describe("leaveTo", () => {
  const original = window.location;
  afterEach(() => Object.defineProperty(window, "location", { value: original, writable: true }));

  it("hands the href to the browser", () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { assign }, writable: true });
    leaveTo("/territories/new");
    expect(assign).toHaveBeenCalledWith("/territories/new");
  });
});
