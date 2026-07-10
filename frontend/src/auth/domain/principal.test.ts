// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { can, type Principal } from "./principal.ts";

function principal(over: Partial<Principal>): Principal {
  return {
    id: "u1",
    email: "u@x.io",
    username: "u",
    status: "active",
    totpEnabled: false,
    roleSlugs: [],
    permissions: [],
    isOwner: false,
    onboardingToursSeen: [],
    ...over,
  };
}

test("can: owner bypasses permission checks even with no roles/permissions", () => {
  const root = principal({ isOwner: true, permissions: [] });
  assert.equal(can(root, "users:read"), true);
  assert.equal(can(root, "anything:at:all"), true);
});

test("can: non-owner needs the explicit permission", () => {
  assert.equal(can(principal({ permissions: ["users:read"] }), "users:read"), true);
  assert.equal(can(principal({ permissions: [] }), "users:read"), false);
});

test("can: null principal is always denied", () => {
  assert.equal(can(null, "users:read"), false);
});
