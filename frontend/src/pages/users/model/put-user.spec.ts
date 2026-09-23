import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { User } from "@/entities/user";
import { putUser } from "./put-user";

const user = (id: string, status = "active") => ({ id, status }) as User;

describe("putUser", () => {
  it("replaces the user in place, keeping the list's order", async () => {
    const client = new QueryClient();
    client.setQueryData(["users"], [user("a"), user("b"), user("c")]);
    await putUser(client, user("b", "frozen"));
    expect(client.getQueryData<User[]>(["users"])?.map((u) => [u.id, u.status])).toEqual([
      ["a", "active"],
      ["b", "frozen"],
      ["c", "active"],
    ]);
  });

  it("appends a user the list does not hold yet", async () => {
    const client = new QueryClient();
    client.setQueryData(["users"], [user("a")]);
    await putUser(client, user("b"));
    expect(client.getQueryData<User[]>(["users"])?.map((u) => u.id)).toEqual(["a", "b"]);
  });

  // No list yet means nothing to write into: a list of one would pass itself
  // off as the whole company.
  it("leaves an unread list unread", async () => {
    const client = new QueryClient();
    await putUser(client, user("a"));
    expect(client.getQueryData(["users"])).toBeUndefined();
  });

  // A refetch that left before the write answers with the list as it was;
  // landing after the write, it would put the old user back.
  it("cancels an in-flight list refetch so it cannot overwrite the write", async () => {
    const client = new QueryClient();
    client.setQueryData(["users"], [user("a")]);
    let answer: (list: User[]) => void = () => {};
    void client.fetchQuery({
      queryKey: ["users"],
      queryFn: () => new Promise<User[]>((resolve) => (answer = resolve)),
    });
    await putUser(client, user("a", "frozen"));
    answer([user("a")]);
    await new Promise((r) => setTimeout(r, 0));
    expect(client.getQueryData<User[]>(["users"])?.[0]?.status).toBe("frozen");
  });
});
