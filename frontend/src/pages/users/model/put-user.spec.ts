import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { User } from "@/entities/user";
import { putUser } from "./put-user";

const user = (id: string, status = "active") => ({ id, status }) as User;

describe("putUser", () => {
  it("replaces the user in place, keeping the list's order", () => {
    const client = new QueryClient();
    client.setQueryData(["users"], [user("a"), user("b"), user("c")]);
    putUser(client, user("b", "frozen"));
    expect(client.getQueryData<User[]>(["users"])?.map((u) => [u.id, u.status])).toEqual([
      ["a", "active"],
      ["b", "frozen"],
      ["c", "active"],
    ]);
  });

  it("appends a user the list does not hold yet", () => {
    const client = new QueryClient();
    client.setQueryData(["users"], [user("a")]);
    putUser(client, user("b"));
    expect(client.getQueryData<User[]>(["users"])?.map((u) => u.id)).toEqual(["a", "b"]);
  });

  // No list yet means nothing to write into: a list of one would pass itself
  // off as the whole company.
  it("leaves an unread list unread", () => {
    const client = new QueryClient();
    putUser(client, user("a"));
    expect(client.getQueryData(["users"])).toBeUndefined();
  });
});
