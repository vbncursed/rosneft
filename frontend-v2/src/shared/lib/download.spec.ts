import { afterEach, describe, expect, it, vi } from "vitest";
import { saveBlob } from "./download";

describe("saveBlob", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hands the blob to the browser as a named download and releases the URL", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    saveBlob(new Blob(["a"]), "audit.csv");
    expect(create).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith("blob:x");
  });
});
