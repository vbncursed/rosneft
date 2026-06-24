// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { validateUsername, validateEmail, validatePassword, generatePassword } from "./credential-rules.ts";

test("username length bounds", () => {
  assert.notEqual(validateUsername("ab"), null); // too short
  assert.equal(validateUsername("abc"), null);
  assert.equal(validateUsername("a".repeat(50)), null);
  assert.notEqual(validateUsername("a".repeat(51)), null); // too long
});

test("email format", () => {
  assert.equal(validateEmail("user@example.com"), null);
  assert.notEqual(validateEmail("not-an-email"), null);
  assert.notEqual(validateEmail(""), null);
});

test("password class requirements", () => {
  assert.equal(validatePassword("Abcdef1!"), null);
  assert.notEqual(validatePassword("Ab1!"), null); // too short
  assert.notEqual(validatePassword("abcdef1!"), null); // no upper
  assert.notEqual(validatePassword("ABCDEF1!"), null); // no lower
  assert.notEqual(validatePassword("Abcdefg!"), null); // no digit
  assert.notEqual(validatePassword("Abcdefg1"), null); // no special
});

test("generated passwords always satisfy the rules", () => {
  for (let i = 0; i < 1000; i++) {
    const p = generatePassword();
    assert.equal(p.length, 16);
    assert.equal(validatePassword(p), null, `invalid generated password: ${p}`);
  }
  assert.equal(generatePassword(32).length, 32);
});
