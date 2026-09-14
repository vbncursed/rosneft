import { describe, expect, it, vi } from "vitest";
import { createCredential, isCancelled } from "./webauthn";

vi.mock("@github/webauthn-json", () => ({
  create: vi.fn(async (opts: unknown) => ({ id: "cred", echoed: opts })),
  supported: () => true,
}));

describe("createCredential", () => {
  it("parses the server's options and stringifies what the authenticator returns", async () => {
    const out = await createCredential(JSON.stringify({ publicKey: { challenge: "c" } }));
    expect(JSON.parse(out)).toEqual({ id: "cred", echoed: { publicKey: { challenge: "c" } } });
  });
});

describe("isCancelled", () => {
  it("is true for a dismissed prompt and a superseded ceremony", () => {
    expect(isCancelled(new DOMException("x", "NotAllowedError"))).toBe(true);
    expect(isCancelled(new DOMException("x", "AbortError"))).toBe(true);
  });

  it("is false for anything else, so real failures still reach the user", () => {
    expect(isCancelled(new DOMException("x", "SecurityError"))).toBe(false);
    expect(isCancelled(new Error("network"))).toBe(false);
  });
});
