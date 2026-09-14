import { describe, expect, it } from "vitest";
import { toTargetJob } from "./to-target-job";

describe("toTargetJob", () => {
  it("maps the whole shape and reads absent fields as null", () => {
    expect(
      toTargetJob({
        id: "j1",
        kind: "territory",
        slug: "yard",
        status: "running",
        progress: 0.4,
        stage: "parsing",
      }),
    ).toEqual({
      kind: "territory",
      slug: "yard",
      status: "running",
      progress: 0.4,
      stage: "parsing",
      errorMessage: null,
    });
    expect(
      toTargetJob({
        id: "j2",
        kind: "model",
        slug: "pump",
        status: "failed",
        errorMessage: "OBJ parse error at line 84120",
      }),
    ).toEqual({
      kind: "model",
      slug: "pump",
      status: "failed",
      progress: null,
      stage: null,
      errorMessage: "OBJ parse error at line 84120",
    });
  });
});
