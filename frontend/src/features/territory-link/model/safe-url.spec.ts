import { describe, expect, it } from "vitest";
import { isSafeHttpUrl } from "./safe-url";

describe("isSafeHttpUrl", () => {
  it("passes https and http", () => {
    expect(isSafeHttpUrl("https://tour.example/refinery")).toBe(true);
    expect(isSafeHttpUrl("http://tour.example/refinery")).toBe(true);
  });

  it("refuses the script and data sinks an <a href> would execute", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("refuses anything that is not a URL at all", () => {
    expect(isSafeHttpUrl("tour.example/refinery")).toBe(false);
    expect(isSafeHttpUrl("")).toBe(false);
  });
});
