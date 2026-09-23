import { describe, expect, it } from "vitest";
import { accessHint, auditHint, contentHint, hintOf, metricsHint, rolesHint, usersHint } from "./console-hints";

describe("console hints", () => {
  it("counts users, naming the frozen only when there are any", () => {
    expect(usersHint(2, 0)).toBe("2 users");
    expect(usersHint(2, 1)).toBe("2 users · 1 frozen");
    expect(usersHint(1, 0)).toBe("1 user");
  });
  it("counts roles and permissions", () => {
    expect(rolesHint(3, 24)).toBe("3 roles · 24 permissions");
    expect(rolesHint(1, 1)).toBe("1 role · 1 permission");
  });
  it("counts content, grants and alerts", () => {
    expect(contentHint(4, 57)).toBe("4 territories · 57 models");
    expect(accessHint(6)).toBe("6 grants");
    expect(accessHint(1)).toBe("1 grant");
    expect(metricsHint(0)).toBe("no alerts firing");
    expect(metricsHint(1)).toBe("1 alert firing");
    expect(metricsHint(2)).toBe("2 alerts firing");
  });
  it("counts the events of the last 24 hours, exactly", () => {
    expect(auditHint(2)).toBe("2 events · 24h");
    expect(auditHint(1)).toBe("1 event · 24h");
    expect(auditHint(250)).toBe("250 events · 24h");
  });
  it("answers static while locked or loading, unavailable when failed, and the count otherwise", () => {
    expect(hintOf("users", { locked: true, loading: false, failed: false }, "12 users")).toEqual({ kind: "static", text: "people and roles" });
    expect(hintOf("users", { locked: false, loading: true, failed: false }, null)).toEqual({ kind: "static", text: "people and roles" });
    expect(hintOf("users", { locked: false, loading: false, failed: true }, null)).toEqual({ kind: "unavailable", text: "count unavailable" });
    expect(hintOf("users", { locked: false, loading: false, failed: false }, "12 users")).toEqual({ kind: "count", text: "12 users" });
    // An answered query that still could not be counted is unavailable, not blank.
    expect(hintOf("users", { locked: false, loading: false, failed: false }, null)).toEqual({ kind: "unavailable", text: "count unavailable" });
    // A key Home has no static line for says nothing rather than "undefined".
    expect(hintOf("tasks", { locked: true, loading: false, failed: false }, null)).toEqual({ kind: "static", text: "" });
  });
});
