import { describe, expect, it, vi } from "vitest";
import type { MouseEvent } from "react";
import { navigateClick } from "./navigate-click";

describe("navigateClick", () => {
  it("routes an in-app anchor and prevents the browser navigation", () => {
    const anchor = document.createElement("a");
    anchor.setAttribute("href", "/models");
    const preventDefault = vi.fn();
    const navigate = vi.fn();
    navigateClick({ target: anchor, button: 0, preventDefault } as unknown as MouseEvent<HTMLDivElement>, navigate);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/models");
  });
});
