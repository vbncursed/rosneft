import { expect, it } from "vitest";
import { uploadStageAt } from "./upload-stage";

it("keeps conversion stages pending even after upload completes", () => {
  expect(uploadStageAt(2, "replacing", "~1 min", 100)).toEqual({ state: "pending", time: "~1 min" });
});
