import { describe, it, expect, beforeEach } from "vitest";
import { isAuthed, markAuthed, clearAuthed } from "@/auth/infrastructure/session-marker";

beforeEach(() => localStorage.clear());

describe("session marker", () => {
  it("reports no session before anyone logs in", () => {
    expect(isAuthed()).toBe(false);
  });

  it("remembers that a session was established", () => {
    markAuthed();
    expect(isAuthed()).toBe(true);
  });

  it("forgets on logout", () => {
    markAuthed();
    clearAuthed();
    expect(isAuthed()).toBe(false);
  });

  // The marker is not a credential and must never be mistaken for one: the
  // session itself lives in an httpOnly cookie this code cannot read.
  it("stores no secret", () => {
    markAuthed();
    const stored = Object.entries(localStorage)
      .map(([k, v]) => `${k}=${v}`)
      .join(";");
    expect(stored).toBe("andrey.authed=1");
  });
});
