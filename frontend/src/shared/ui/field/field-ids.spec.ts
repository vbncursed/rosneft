import { describe, expect, it } from "vitest";
import { describedBy, errorId, hintId } from "./field-ids";

describe("hintId / errorId", () => {
  it("derives stable ids from the control's own id", () => {
    expect(hintId("title")).toBe("title-hint");
    expect(errorId("title")).toBe("title-error");
  });
});

describe("describedBy", () => {
  it("points at nothing when there is neither hint nor error", () => {
    expect(describedBy("title")).toBeUndefined();
  });

  it("points at the hint when only a hint is given", () => {
    expect(describedBy("title", "Shown in the catalog")).toBe("title-hint");
  });

  it("prefers the error — a wrong value matters more than an explanation", () => {
    expect(describedBy("title", "Shown in the catalog", "Required")).toBe("title-error");
    expect(describedBy("title", undefined, "Required")).toBe("title-error");
  });
});
