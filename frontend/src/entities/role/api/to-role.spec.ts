import { describe, expect, it } from "vitest";
import { toRole } from "./to-role";

describe("toRole", () => {
  it("counts grants, marks system roles immutable, and leaves the people count unknown", () => {
    const r = toRole({
      slug: "admin",
      title: "Company Owner",
      isSystem: true,
      permissionSlugs: ["users:read", "users:write"],
    } as never);
    expect(r).toEqual({
      slug: "admin",
      title: "Company Owner",
      kind: "system",
      permissionSlugs: ["users:read", "users:write"],
      grants: 2,
      users: null,
      updated: "immutable",
    });
  });

  it("dates nothing on a custom role and tolerates absent fields", () => {
    const r = toRole({ slug: "ops", title: "Ops", isSystem: false } as never);
    expect(r.kind).toBe("custom");
    expect(r.permissionSlugs).toEqual([]);
    expect(r.updated).toBe("");
  });

  // A Go nil slice marshals to JSON null — mirrors to-user.spec.ts's defence
  // against the same shape on roleSlugs.
  it("defends permissionSlugs against the gateway's null", () => {
    const r = toRole({ slug: "ops", title: "Ops", isSystem: false, permissionSlugs: null } as never);
    expect(r).toEqual({
      slug: "ops",
      title: "Ops",
      kind: "custom",
      permissionSlugs: [],
      grants: 0,
      users: null,
      updated: "",
    });
  });
});
