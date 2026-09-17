import { afterEach, describe, expect, it, vi } from "vitest";
import { codesAsText, downloadText } from "./download";

afterEach(() => vi.restoreAllMocks());

describe("codesAsText", () => {
  it("writes one code per line and ends the file with a newline", () => {
    expect(codesAsText(["8k2fq-p1x7d", "m4wla-9zt3c"])).toBe("8k2fq-p1x7d\nm4wla-9zt3c\n");
  });

  it("copes with a single code and with none", () => {
    expect(codesAsText(["only-one"])).toBe("only-one\n");
    expect(codesAsText([])).toBe("\n");
  });
});

describe("downloadText", () => {
  it("names the file and cleans the object URL up after clicking", () => {
    const createObjectURL = vi.fn(() => "blob:fake");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    const click = vi.fn();
    const link = document.createElement("a");
    link.click = click;
    vi.spyOn(document, "createElement").mockReturnValue(link);

    downloadText("recovery-codes.txt", "a\nb\n");

    expect(link.download).toBe("recovery-codes.txt");
    expect(link.href).toContain("blob:fake");
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    expect(document.body.contains(link)).toBe(false);
  });
});
