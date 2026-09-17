import { describe, expect, it } from "vitest";
import { toStoredChain } from "./to-measurement";

describe("toStoredChain", () => {
  it("keeps the points and the closed flag and files the row id as the server id", () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 2, z: 3 },
    ];
    expect(
      toStoredChain({
        id: 42,
        territorySlug: "north",
        points,
        closed: true,
        createdAt: "2026-09-17T10:00:00Z",
        updatedAt: "2026-09-17T10:00:00Z",
      }),
    ).toEqual({ serverId: 42, points, closed: true });
  });
});
