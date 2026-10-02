import { describe, expect, it } from "vitest";
import { BLOB_CSP, CSP, withBlobCsp, withCsp } from "./csp";

describe("withCsp", () => {
  it("puts the policy on every HTML document", () => {
    const res = withCsp(new Response("<p>", { headers: { "content-type": "text/html; charset=utf-8" } }));
    expect(res.headers.get("content-security-policy")).toBe(CSP);
  });
  it("matches the content type case-insensitively", () => {
    const res = withCsp(new Response("<p>", { headers: { "content-type": "Text/HTML; charset=UTF-8" } }));
    expect(res.headers.get("content-security-policy")).toBe(CSP);
  });
  it("leaves everything else alone", () => {
    const res = withCsp(new Response("{}", { headers: { "content-type": "application/json" } }));
    expect(res.headers.get("content-security-policy")).toBeNull();
  });
  it("keeps the status and the body", async () => {
    const res = withCsp(new Response("<p>x", { status: 404, headers: { "content-type": "text/html" } }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("<p>x");
  });
  it("spells out the directives that do not fall back to default-src", () => {
    for (const d of ["base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'", "object-src 'none'"]) {
      expect(CSP).toContain(d);
    }
  });
});

describe("withBlobCsp", () => {
  it("sandboxes and nosniffs a blob, whatever its type", async () => {
    const res = withBlobCsp(new Response("<p>", { status: 206, headers: { "content-type": "text/html" } }));
    expect(res.headers.get("content-security-policy")).toBe(BLOB_CSP);
    expect(BLOB_CSP).toBe("sandbox; default-src 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-type")).toBe("text/html");
    expect(res.status).toBe(206);
    expect(await res.text()).toBe("<p>");
  });
  it("passes a network error through", () => {
    const err = Response.error();
    expect(withBlobCsp(err)).toBe(err);
  });
});
