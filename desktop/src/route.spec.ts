import { describe, expect, it } from "vitest";
import { classify } from "./route";

const at = (path: string) => new URL(`https://andrey.vbncursed.fun${path}`);
const HASH = "b".repeat(64);

describe("classify", () => {
  it("treats a dotless path as a navigation", () => {
    expect(classify("GET", at("/"))).toEqual({ kind: "navigate" });
    expect(classify("GET", at("/territories/ust-kut?jobId=1"))).toEqual({ kind: "navigate" });
  });
  it("treats a dotted path as a shell file", () => {
    expect(classify("GET", at("/assets/index-3f9a.js"))).toEqual({ kind: "shell", path: "/assets/index-3f9a.js" });
    expect(classify("GET", at("/pdfjs/web/viewer.html"))).toEqual({ kind: "shell", path: "/pdfjs/web/viewer.html" });
  });
  it("caches a blob only for a plain GET", () => {
    expect(classify("GET", at(`/api/assets/${HASH}`))).toEqual({ kind: "blob", hash: HASH });
    expect(classify("GET", at(`/api/assets/${HASH}?v=1`))).toEqual({ kind: "pass" });
    expect(classify("HEAD", at(`/api/assets/${HASH}`))).toEqual({ kind: "pass" });
  });
  it("snapshots the whitelist and nothing with a query", () => {
    for (const p of ["/api/auth/me", "/api/territories", "/api/territories/ust-kut", "/api/territories/ust-kut/scene", "/api/models"]) {
      expect(classify("GET", at(p))).toEqual({ kind: "snapshot", key: p });
    }
    expect(classify("GET", at("/api/audit?limit=50"))).toEqual({ kind: "pass" });
    expect(classify("GET", at("/api/territories?x=1"))).toEqual({ kind: "pass" });
    expect(classify("GET", at("/api/jobs/abc/events"))).toEqual({ kind: "pass" });
  });
  it("resets the session on every step that issues or revokes a cookie", () => {
    for (const p of ["/api/auth/login", "/api/auth/login/2fa", "/api/auth/passkey/login/begin", "/api/auth/passkey/login/finish", "/api/auth/logout"]) {
      expect(classify("POST", at(p))).toEqual({ kind: "session-reset" });
    }
    expect(classify("GET", at("/api/auth/logout"))).toEqual({ kind: "pass" });
  });
  it("passes every other method through", () => {
    expect(classify("POST", at("/api/territories"))).toEqual({ kind: "pass" });
    expect(classify("POST", at("/"))).toEqual({ kind: "pass" });
  });
});
