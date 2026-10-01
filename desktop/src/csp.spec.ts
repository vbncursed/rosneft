import { describe, expect, it } from "vitest";
import { CSP, withCsp } from "./csp";

describe("withCsp", () => {
  it("puts the policy on every HTML document", () => {
    const res = withCsp(new Response("<p>", { headers: { "content-type": "text/html; charset=utf-8" } }));
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
