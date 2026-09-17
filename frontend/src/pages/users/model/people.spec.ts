import { describe, expect, it } from "vitest";
import type { Role } from "@/entities/role";
import type { User } from "@/entities/user";
import { coverageOf, groupPeople, inspectorDetails, matchesPerson, statsOf } from "./people";

const make = (id: string, username: string, roles: string[], over: Partial<User> = {}): User => ({
  id,
  username,
  email: `${username}@example.com`,
  status: "active",
  totpEnabled: true,
  passkeyEnabled: true,
  totpRequired: false,
  roleSlugs: roles,
  roleTitles: Object.fromEntries(roles.map((r) => [r, r])),
  isOwner: false,
  ...over,
});

const role = (slug: string, title: string, kind: Role["kind"] = "system"): Role => ({
  slug,
  title,
  kind,
  permissionSlugs: [],
  grants: 0,
  users: null,
  updated: "",
});

describe("matchesPerson", () => {
  it("applies role, status and factor chips and free text on username or email", () => {
    const u = make("u-1", "a.ivanova", ["admin"], { totpEnabled: false, passkeyEnabled: null });
    expect(matchesPerson(u, "role:admin")).toBe(true);
    expect(matchesPerson(u, "role:guest")).toBe(false);
    expect(matchesPerson(u, "2fa:off passkey:unknown")).toBe(true);
    expect(matchesPerson(u, "status:frozen")).toBe(false);
    expect(matchesPerson(u, "IVAN")).toBe(true);
    expect(matchesPerson(u, "colour:blue")).toBe(true); // unknown keys are ignored
  });

  it("matches an email the username does not carry, and refuses what neither does", () => {
    const u = make("u-1", "a.ivanova", [], { email: "chief@rosneft.example" });
    expect(matchesPerson(u, "chief")).toBe(true);
    expect(matchesPerson(u, "nobody")).toBe(false);
    expect(matchesPerson(u, "")).toBe(true);
  });

  it("reads an enabled factor as on and a status chip that fits", () => {
    const u = make("u-1", "a", [], { status: "frozen", totpEnabled: true, passkeyEnabled: false });
    expect(matchesPerson(u, "status:frozen 2fa:on passkey:off")).toBe(true);
    expect(matchesPerson(u, "2fa:off")).toBe(false);
    expect(matchesPerson(u, "passkey:on")).toBe(false);
  });
});

describe("groupPeople", () => {
  it("puts owners first, then one group per role in the gateway's order, then the roleless", () => {
    const roles = [role("admin", "Company Owner"), role("guest", "Guest")];
    const groups = groupPeople(
      [
        make("u-1", "root", [], { isOwner: true }),
        make("u-2", "g", ["guest"]),
        make("u-3", "a", ["admin", "guest"]),
        make("u-4", "n", []),
      ],
      roles,
    );
    expect(groups.map((g) => [g.key, g.people.map((p) => p.user.username)])).toEqual([
      ["owners", ["root"]],
      ["admin", ["a"]],
      ["guest", ["g"]],
      ["none", ["n"]],
    ]);
    expect(groups[1].label).toBe("Company Owner");
  });

  it("files someone whose only role no longer exists under No role", () => {
    const groups = groupPeople([make("u-1", "ghost", ["deleted-role"])], [role("guest", "Guest")]);
    expect(groups.find((g) => g.key === "none")?.people.map((p) => p.user.username)).toEqual([
      "ghost",
    ]);
  });
});

describe("coverageOf and statsOf", () => {
  it("counts second factors without ever counting an unknown as off", () => {
    const users = [
      make("1", "both", [], { totpEnabled: true, passkeyEnabled: true }),
      make("2", "one", [], { totpEnabled: true, passkeyEnabled: false }),
      make("3", "none", [], { totpEnabled: false, passkeyEnabled: false }),
      make("4", "unknown", [], { totpEnabled: null, passkeyEnabled: null }),
      make("5", "gone", [], { status: "deleted", totpEnabled: false, passkeyEnabled: false }),
    ];
    const c = coverageOf(users);
    expect(c.detail).toBe("2 / 4");
    expect(c.segments.map((s) => [s.label, s.value])).toEqual([
      ["2FA + passkey", 1],
      ["one factor", 1],
      ["password only", 1],
      ["unknown", 1],
    ]);
    const s = statsOf(users, [role("admin", "Company Owner", "system"), role("ops", "Ops", "custom")]);
    expect(s[0]).toEqual({ label: "Accounts", value: "4", hint: "4 active · 0 frozen" });
    expect(s[2]).toEqual({
      label: "Needs attention",
      value: "1",
      hint: "no second factor",
      tone: "bad",
    });
  });

  it("counts the roles actually held, split into system and custom", () => {
    const users = [
      make("1", "a", ["admin"], { status: "frozen" }),
      make("2", "b", ["ops", "admin"]),
      make("3", "c", ["gone"], { status: "deleted" }),
    ];
    const s = statsOf(users, [role("admin", "Company Owner"), role("ops", "Ops", "custom")]);
    expect(s[0]).toEqual({ label: "Accounts", value: "2", hint: "1 active · 1 frozen" });
    expect(s[1]).toEqual({ label: "Roles in use", value: "2", hint: "1 system · 1 custom" });
  });

  it("calls a population with a second factor everywhere healthy", () => {
    const s = statsOf([make("1", "a", [])], []);
    expect(s[2].tone).toBe("ok");
    expect(s[2].value).toBe("0");
  });
});

describe("inspectorDetails", () => {
  it("reads the three facts the account carries", () => {
    const d = inspectorDetails(
      make("1", "a", [], { totpEnabled: null, passkeyEnabled: true, totpRequired: true }),
    );
    expect(d.map((x) => [x.label, x.value])).toEqual([
      ["2FA", "—"],
      ["passkey", "Yes"],
      ["2FA required", "yes"],
    ]);
  });

  it("tones a known-off factor as bad and an unenforced policy as dim", () => {
    const d = inspectorDetails(make("1", "a", [], { totpEnabled: false, passkeyEnabled: false }));
    expect(d.map((x) => [x.value, x.tone])).toEqual([
      ["No", "bad"],
      ["No", "bad"],
      ["no", "dim"],
    ]);
  });
});
