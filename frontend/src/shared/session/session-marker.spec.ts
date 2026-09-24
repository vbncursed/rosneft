import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAuthed, enrollBouncedAt, isAuthed, markAuthed, markEnrollBounce } from "./session-marker";

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("session marker", () => {
  it("is absent before anyone signs in", () => {
    expect(isAuthed()).toBe(false);
  });

  it("records that a session was established", () => {
    markAuthed();
    expect(isAuthed()).toBe(true);
  });

  it("clears on sign-out", () => {
    markAuthed();
    clearAuthed();
    expect(isAuthed()).toBe(false);
  });

  // The marker is a flag, not a credential: any other value is not a session.
  it("does not treat a foreign value as a session", () => {
    localStorage.setItem("andrey.authed", "yes");
    expect(isAuthed()).toBe(false);
  });
});

describe("enrolment bounce", () => {
  it("is absent until the client bounces", () => {
    expect(enrollBouncedAt()).toBeNull();
  });

  it("records when the client bounced", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    markEnrollBounce();
    expect(enrollBouncedAt()).toBe(1234);
  });

  it("reads a foreign value as no bounce", () => {
    sessionStorage.setItem("andrey.enrollBounce", "soon");
    expect(enrollBouncedAt()).toBeNull();
  });

  // Storage can throw (blocked site data); neither side may take the page down.
  it("survives a storage that throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => markEnrollBounce()).not.toThrow();
    expect(enrollBouncedAt()).toBeNull();
  });
});
