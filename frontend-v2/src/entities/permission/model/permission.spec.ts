import { describe, expect, it } from "vitest";
import { actionOf, groupOf, groupPermissions } from "./permission";

describe("groupOf / actionOf", () => {
  it("splits a slug on its colon", () => {
    expect(groupOf("territory:read")).toBe("territory");
    expect(actionOf("territory:read")).toBe("read");
  });

  it("treats a slug with no colon as its own action", () => {
    expect(groupOf("root")).toBe("root");
    expect(actionOf("root")).toBe("root");
  });

  it("keeps only the first colon as the separator", () => {
    expect(actionOf("audit:read:own")).toBe("read");
  });
});

describe("groupPermissions", () => {
  it("collects permissions under their prefix", () => {
    const groups = groupPermissions([
      { slug: "territory:read" },
      { slug: "users:read" },
      { slug: "territory:write" },
    ]);

    expect(groups).toEqual([
      { name: "territory", permissions: [{ slug: "territory:read" }, { slug: "territory:write" }] },
      { name: "users", permissions: [{ slug: "users:read" }] },
    ]);
  });

  it("keeps first-seen order rather than sorting", () => {
    const groups = groupPermissions([{ slug: "users:read" }, { slug: "audit:read" }]);
    expect(groups.map((g) => g.name)).toEqual(["users", "audit"]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupPermissions([])).toEqual([]);
  });
});
