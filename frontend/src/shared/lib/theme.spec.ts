import { describe, expect, it } from "vitest";
import { applyTheme } from "./theme";

describe("applyTheme", () => {
  it("stamps an explicit choice on the root", () => {
    const root = document.createElement("html");
    applyTheme("light", root);
    expect(root.dataset.theme).toBe("light");
    applyTheme("dark", root);
    expect(root.dataset.theme).toBe("dark");
  });

  it("clears the attribute so the OS preference takes over again", () => {
    const root = document.createElement("html");
    applyTheme("dark", root);
    applyTheme(null, root);
    expect(root.hasAttribute("data-theme")).toBe(false);
  });
});
