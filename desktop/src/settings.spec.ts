import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SettingsFile } from "./settings";
import { DEFAULT_LIMIT, LIMITS } from "./validate";

const USER = "0b5e8a3c-1f2d-4c5b-9a7e-3d2c1b0a9f8e";
const file = () => path.join(mkdtempSync(path.join(tmpdir(), "settings-")), "settings.json");

describe("SettingsFile", () => {
  it("starts signed out with the default limit when there is no file", () => {
    expect(new SettingsFile(file()).value).toEqual({ userId: null, limit: DEFAULT_LIMIT, dismissedUpdate: null });
  });
  it("persists an update", async () => {
    const f = file();
    await new SettingsFile(f).update({ userId: USER, limit: LIMITS[0], dismissedUpdate: null });
    expect(new SettingsFile(f).value).toEqual({ userId: USER, limit: LIMITS[0], dismissedUpdate: null });
  });
  it("drops values it would never have written", () => {
    const f = file();
    writeFileSync(f, JSON.stringify({ userId: "../../etc", limit: 3 }));
    expect(new SettingsFile(f).value).toEqual({ userId: null, limit: DEFAULT_LIMIT, dismissedUpdate: null });
  });
  it("keeps the last of two quick updates", async () => {
    const f = file();
    const s = new SettingsFile(f);
    void s.update({ userId: USER });
    await s.update({ userId: null });
    expect(JSON.parse(readFileSync(f, "utf8")).userId).toBeNull();
  });
  it("keeps a valid dismissedUpdate and nulls a bad one", () => {
    const f = file();
    writeFileSync(f, JSON.stringify({ dismissedUpdate: "1.2.3" }));
    expect(new SettingsFile(f).value.dismissedUpdate).toBe("1.2.3");
    writeFileSync(f, JSON.stringify({ dismissedUpdate: "v1.2" }));
    expect(new SettingsFile(f).value.dismissedUpdate).toBeNull();
  });
});
