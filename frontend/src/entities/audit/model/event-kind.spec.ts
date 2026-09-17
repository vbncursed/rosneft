import { describe, expect, it } from "vitest";
import { eventKind } from "./event-kind";

describe("eventKind", () => {
  it("reads the journal's own verbs: insert creates, delete deletes, update and everything else update", () => {
    expect(eventKind("territory.insert")).toBe("create");
    expect(eventKind("model.delete")).toBe("delete");
    expect(eventKind("placement.update")).toBe("update");
    expect(eventKind("auth.login")).toBe("auth");
    expect(eventKind("something.odd")).toBe("update");
  });

  it("groups everything under auth. as one kind", () => {
    expect(eventKind("auth.login")).toBe("auth");
    expect(eventKind("auth.logout")).toBe("auth");
    expect(eventKind("auth.passkey.insert")).toBe("auth");
  });

  it("reads through a multi-part entity name", () => {
    expect(eventKind("territory_assignment.insert")).toBe("create");
  });

  it("falls back to update rather than claiming a creation or a deletion", () => {
    expect(eventKind("territory.reconvert")).toBe("update");
    expect(eventKind("nonsense")).toBe("update");
    expect(eventKind("")).toBe("update");
  });
});
