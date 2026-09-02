import { afterEach, describe, expect, it } from "vitest";
import { clearAuthed, isAuthed, markAuthed } from "./session-marker";

afterEach(() => localStorage.clear());

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
