import { describe, expect, it } from "vitest";
import type { Permission } from "@/entities/permission";
import type { Role } from "@/entities/role";
import type { User } from "@/entities/user";
import {
  distributionOf,
  groupRoles,
  matchesRole,
  roleChips,
  statsOf,
  withUserCounts,
} from "./roles-view";

const role = (over: Partial<Role> = {}): Role => ({
  slug: "ops",
  title: "Operations",
  kind: "custom",
  permissionSlugs: [],
  grants: 0,
  users: null,
  updated: "upd. 29.08",
  ...over,
});

const user = (over: Partial<User> = {}): User => ({
  id: "u-1",
  username: "a.ivanova",
  email: "a.ivanova@example.com",
  status: "active",
  totpEnabled: true,
  passkeyEnabled: null,
  totpRequired: false,
  roleSlugs: ["ops"],
  roleTitles: { ops: "Operations" },
  isOwner: false,
  ...over,
});

const PERMISSIONS: Permission[] = [{ slug: "users:read" }, { slug: "users:write" }];

describe("matchesRole", () => {
  it("keeps only custom roles under kind:custom", () => {
    expect(matchesRole(role(), "kind:custom")).toBe(true);
    expect(matchesRole(role({ kind: "system" }), "kind:custom")).toBe(false);
  });

  // The mock writes the dotted form; the gateway speaks colons. Both are typed.
  it("reads grants: in the mock's dotted form and the gateway's own", () => {
    const holder = role({ permissionSlugs: ["users:write"] });
    expect(matchesRole(holder, "grants:users.write")).toBe(true);
    expect(matchesRole(holder, "grants:users:write")).toBe(true);
    expect(matchesRole(role(), "grants:users.write")).toBe(false);
  });

  it("matches free text against the slug or the title", () => {
    expect(matchesRole(role(), "ops")).toBe(true);
    expect(matchesRole(role(), "OPERAT")).toBe(true);
    expect(matchesRole(role(), "surveyor")).toBe(false);
    expect(matchesRole(role(), "")).toBe(true);
  });
});

describe("withUserCounts", () => {
  it("counts the live holders of each role", () => {
    const roles = [role(), role({ slug: "guest", title: "Guest" })];
    const counted = withUserCounts(roles, [
      user(),
      user({ id: "u-2", username: "b", roleSlugs: ["ops"] }),
      user({ id: "u-3", username: "c", roleSlugs: ["ops"], status: "deleted" }),
    ]);
    expect(counted.map((r) => r.users)).toEqual([2, 0]);
  });

  // The gateway already answered null; nothing here invents a number for it.
  it("leaves every count unknown when the people are not readable", () => {
    expect(withUserCounts([role(), role({ slug: "guest" })], null).map((r) => r.users)).toEqual([
      null,
      null,
    ]);
  });
});

describe("roleChips", () => {
  it("collapses a wholly-held group into one strong chip", () => {
    expect(roleChips(role({ permissionSlugs: ["users:read", "users:write"] }), PERMISSIONS)).toEqual(
      [{ label: "users.*", tone: "strong" }],
    );
  });

  it("names each grant when only part of a group is held", () => {
    expect(roleChips(role({ permissionSlugs: ["users:read"] }), PERMISSIONS)).toEqual([
      { label: "users.read" },
    ]);
  });

  it("locks a grant this actor may not hand out", () => {
    expect(
      roleChips(role({ permissionSlugs: ["users:read"] }), PERMISSIONS, new Set(["users:write"])),
    ).toEqual([{ label: "users.read", tone: "locked" }]);
  });

  it("shows at most three", () => {
    const all = ["a:1", "b:1", "c:1", "d:1", "e:1"].map((slug) => ({ slug }));
    expect(roleChips(role({ permissionSlugs: all.map((p) => p.slug) }), all)).toHaveLength(3);
  });
});

describe("groupRoles", () => {
  const clean = { slug: null, dirty: false };

  it("splits system from custom and notes what each group is", () => {
    const groups = groupRoles(
      [role({ slug: "guest", title: "Guest", kind: "system" }), role(), role({ slug: "surveyor" })],
      null,
      PERMISSIONS,
      undefined,
      clean,
    );
    expect(groups.map((g) => [g.label, g.note])).toEqual([
      ["System roles", "read-only · defined by migrations"],
      ["Custom roles", "2 roles · editable"],
    ]);
    expect(groups[0].roles[0].tag).toBe("system");
    expect(groups[0].roles[0].tone).toBe("warn");
  });

  it("counts one custom role in the singular", () => {
    expect(groupRoles([role()], null, PERMISSIONS, undefined, clean)[1].note).toBe(
      "1 role · editable",
    );
  });

  // The tag is the only thing on the card that says the draft is unsaved.
  it("tags the selected custom role editing only while it is dirty", () => {
    const selected = groupRoles([role()], null, PERMISSIONS, undefined, {
      slug: "ops",
      dirty: true,
    })[1].roles[0];
    expect(selected.tag).toBe("editing");
    expect(selected.tagTone).toBe("accent");
    expect(selected.tone).toBe("accent");

    const saved = groupRoles([role()], null, PERMISSIONS, undefined, {
      slug: "ops",
      dirty: false,
    })[1].roles[0];
    expect(saved.tag).toBeUndefined();
  });

  it("never tags a system role editing, whatever the draft says", () => {
    const entry = groupRoles([role({ kind: "system" })], null, PERMISSIONS, undefined, {
      slug: "ops",
      dirty: true,
    })[0].roles[0];
    expect(entry.tag).toBe("system");
  });

  it("stacks the live holders' faces, and none at all when they are unknown", () => {
    const users = [user(), user({ id: "u-2", username: "b.petrov" }), user({ id: "u-3", username: "gone", status: "deleted" })];
    expect(groupRoles([role()], users, PERMISSIONS, undefined, clean)[1].roles[0].faces).toEqual([
      "a.ivanova",
      "b.petrov",
    ]);
    expect(groupRoles([role()], null, PERMISSIONS, undefined, clean)[1].roles[0].faces).toEqual([]);
  });
});

describe("distributionOf", () => {
  it("gives every role a segment of its holders", () => {
    const roles = [role(), role({ slug: "guest" })];
    const users = [user(), user({ id: "u-2", username: "b", roleSlugs: ["ops", "guest"] })];
    expect(distributionOf(roles, users)).toEqual({
      label: "People by role",
      detail: "2 accounts",
      segments: [
        { tone: "accent", value: 2, label: "ops" },
        { tone: "ok", value: 1, label: "guest" },
      ],
    });
  });

  it("says so rather than drawing an empty bar when the people are unknown", () => {
    expect(distributionOf([role()], null)).toEqual({
      label: "People by role",
      detail: "unavailable",
      segments: [],
    });
  });
});

describe("statsOf", () => {
  it("counts roles, permissions and owners", () => {
    const roles = [role({ kind: "system" }), role({ slug: "ops2" })];
    const users = [user({ isOwner: true }), user({ id: "u-2", username: "b" })];
    expect(statsOf(roles, PERMISSIONS, users)).toEqual([
      { label: "Roles", value: "2", hint: "1 system · 1 custom" },
      { label: "Permissions", value: "2", hint: "1 resource groups" },
      { label: "Root holders", value: "1", hint: "unrestricted access", tone: "accent" },
    ]);
  });

  it("prints an em dash for owners it could not count", () => {
    expect(statsOf([role()], PERMISSIONS, null)[2].value).toBe("—");
  });
});
