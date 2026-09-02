import { describe, expect, it } from "vitest";
import { eventKind } from "./event-kind";

describe("eventKind", () => {
  it("reads the verb off the end of the action", () => {
    expect(eventKind("territory.create")).toBe("create");
    expect(eventKind("placement.update")).toBe("update");
    expect(eventKind("model.delete")).toBe("delete");
  });

  it("groups everything under auth. as one kind", () => {
    expect(eventKind("auth.login")).toBe("auth");
    expect(eventKind("auth.logout")).toBe("auth");
    expect(eventKind("auth.passkey.create")).toBe("auth");
  });

  it("reads through a multi-part entity name", () => {
    expect(eventKind("territory_assignment.create")).toBe("create");
  });

  it("falls back to update rather than claiming a creation or a deletion", () => {
    expect(eventKind("territory.reconvert")).toBe("update");
    expect(eventKind("nonsense")).toBe("update");
    expect(eventKind("")).toBe("update");
  });
});
