import { describe, expect, it } from "vitest";
import { pickIdentity, SIGNING_CN } from "./signing";

const HASH = "A".repeat(40);
const OTHER = "B".repeat(40);

describe("pickIdentity", () => {
  it("returns the hash of the identity with our name, trusted or not", () => {
    const out = `  1) ${OTHER} "Someone Else"\n  2) ${HASH} "${SIGNING_CN}" (CSSMERR_TP_NOT_TRUSTED)\n     2 identities found`;
    expect(pickIdentity(out)).toBe(HASH);
  });
  it("is null when the keychain holds no such identity", () => {
    expect(pickIdentity(`  1) ${OTHER} "Someone Else"\n`)).toBeNull();
    expect(pickIdentity("     0 identities found\n")).toBeNull();
  });
});
