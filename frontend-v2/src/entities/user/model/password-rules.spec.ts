import { describe, expect, it } from "vitest";
import { generatePassword, validatePassword } from "./password-rules";

describe("validatePassword — mirrors auth-service internal/validate", () => {
  it("accepts one of each class within 8–256", () => {
    expect(validatePassword("Abcdef1!")).toBeNull();
  });
  it("names the length bound", () => {
    expect(validatePassword("Ab1!")).toBe("Password must be 8–256 characters");
    expect(validatePassword("A1!" + "a".repeat(254))).toBe("Password must be 8–256 characters");
  });
  it("names the missing class", () => {
    const msg = "Password needs an upper- and lower-case letter, a digit, and a special character";
    expect(validatePassword("abcdef1!")).toBe(msg);
    expect(validatePassword("ABCDEF1!")).toBe(msg);
    expect(validatePassword("Abcdefg!")).toBe(msg);
    expect(validatePassword("Abcdefg1")).toBe(msg);
  });
  it("counts runes, not UTF-16 units, like the Go side", () => {
    expect(validatePassword("Ab1!😀😀😀😀")).toBeNull(); // 8 runes
  });
});

describe("generatePassword", () => {
  it("always satisfies validatePassword, at the default and a custom length", () => {
    for (let i = 0; i < 500; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(16);
      expect(validatePassword(p)).toBeNull();
    }
    expect(generatePassword(32)).toHaveLength(32);
  });
});
