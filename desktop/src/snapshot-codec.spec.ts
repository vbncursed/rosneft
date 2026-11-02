import { describe, expect, it } from "vitest";
import { decodeSnapshot, encodeSnapshot } from "./snapshot-codec";

describe("snapshot codec", () => {
  it("round-trips meta and body", () => {
    const meta = { status: 200, headers: [["etag", "x"]] as [string, string][] };
    const got = decodeSnapshot(encodeSnapshot(meta, Buffer.from("body")));
    expect(got?.meta).toEqual(meta);
    expect(got?.body.toString()).toBe("body");
  });

  it("a declared meta length past the end is no snapshot", () => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(99);
    expect(decodeSnapshot(Buffer.concat([head, Buffer.from("{}")]))).toBeNull();
  });
});
