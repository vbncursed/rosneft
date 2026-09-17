import { describe, expect, it } from "vitest";
import type { AuditEntry } from "@/entities/audit";
import { accessHint, auditHint, contentHint, hintOf, metricsHint, rolesHint, usersHint } from "./console-hints";

const user = (status: "active" | "frozen" | "deleted") => ({
  id: status, username: status, email: "", status, totpEnabled: null, passkeyEnabled: null, totpRequired: false,
  roleSlugs: [], roleTitles: {}, isOwner: false,
});
const entry = (at: string): AuditEntry => ({
  id: 1, at, actorId: "", actorLogin: "", companyId: "", companyLogin: "", action: "x", entity: "", entityId: "",
  entityLabel: "", territorySlug: "", oldRow: null, newRow: null, result: "ok",
});
const NOW = new Date("2026-09-08T12:30:00Z");

describe("console hints", () => {
  it("counts users without the deleted, naming the frozen only when there are any", () => {
    expect(usersHint([user("active"), user("active"), user("deleted")])).toBe("2 users");
    expect(usersHint([user("active"), user("frozen")])).toBe("2 users · 1 frozen");
    expect(usersHint([user("active")])).toBe("1 user");
  });
  it("counts roles and permissions", () => {
    const role = { slug: "r", title: "R", kind: "custom" as const, permissionSlugs: [], grants: 0, users: null, updated: "" };
    const perm = { slug: "users:read" };
    expect(rolesHint([role, role, role], Array(24).fill(perm))).toBe("3 roles · 24 permissions");
    expect(rolesHint([role], [perm])).toBe("1 role · 1 permission");
  });
  it("counts content, grants and alerts", () => {
    expect(contentHint(4, 57)).toBe("4 territories · 57 models");
    expect(accessHint(6)).toBe("6 grants");
    expect(accessHint(1)).toBe("1 grant");
    expect(metricsHint([])).toBe("no alerts firing");
    const alert = (state: "firing" | "pending") => ({ name: state, meta: "", state, service: "", severity: "" });
    expect(metricsHint([alert("firing"), alert("pending")])).toBe("1 alert firing");
    expect(metricsHint([alert("firing"), alert("firing")])).toBe("2 alerts firing");
  });
  it("counts the events inside the 24 drawn hours, and caps at the window limit", () => {
    // 13:59 lands in bucketOf's oldest bucket (starts 13:00, 23h before NOW's
    // running hour); 12:59 is the hour below it and is dropped. Verified
    // against the real bucketOf in entities/audit/model/window.spec.ts.
    expect(auditHint([entry("2026-09-08T12:01:00Z"), entry("2026-09-07T13:59:00Z"), entry("2026-09-07T12:59:00Z")], NOW)).toBe("2 events · 24h");
    expect(auditHint([entry("2026-09-08T12:01:00Z")], NOW)).toBe("1 event · 24h");
    expect(auditHint(Array.from({ length: 200 }, () => entry("2026-09-08T12:01:00Z")), NOW)).toBe("200+ events · 24h");
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
