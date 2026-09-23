import type { QueryClient } from "@tanstack/react-query";
import { usersQuery, type User } from "@/entities/user";

function upsert(list: User[], user: User): User[] {
  if (!list.some((u) => u.id === user.id)) return [...list, user];
  return list.map((u) => (u.id === user.id ? user : u));
}

/**
 * Writes the gateway's answer for one user into the cached list — in place,
 * or appended when the list does not hold them yet — rather than asking for
 * the whole list again. A list never read stays unread. An in-flight refetch
 * is cancelled first: it left before the write and would land the old user
 * back on top of it. If an invalidation started that refetch (a delete's
 * refresh), the cancel and the write would drop it, so the list is marked
 * again — and re-read if a screen is showing it.
 */
export async function putUser(client: QueryClient, user: User): Promise<void> {
  const { queryKey } = usersQuery;
  const wasStale = client.getQueryState(queryKey)?.isInvalidated ?? false;
  await client.cancelQueries({ queryKey });
  client.setQueryData(queryKey, (list) => list && upsert(list, user));
  if (wasStale) void client.invalidateQueries({ queryKey, exact: true });
}
