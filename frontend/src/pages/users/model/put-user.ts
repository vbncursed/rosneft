import type { QueryClient } from "@tanstack/react-query";
import { usersQuery, type User } from "@/entities/user";

/**
 * Writes the gateway's answer for one user into the cached list — in place,
 * or appended when the list does not hold them yet — rather than asking for
 * the whole list again. A list never read stays unread. An in-flight refetch
 * is cancelled first: it left before the write and would land the old user
 * back on top of it.
 */
export async function putUser(client: QueryClient, user: User): Promise<void> {
  await client.cancelQueries({ queryKey: usersQuery.queryKey });
  client.setQueryData(usersQuery.queryKey, (list) =>
    list && (list.some((u) => u.id === user.id) ? list.map((u) => (u.id === user.id ? user : u)) : [...list, user]),
  );
}
