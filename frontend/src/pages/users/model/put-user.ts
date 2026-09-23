import type { QueryClient } from "@tanstack/react-query";
import { usersQuery, type User } from "@/entities/user";

/**
 * Writes the gateway's answer for one user into the cached list — in place,
 * or appended when the list does not hold them yet — rather than asking for
 * the whole list again. A list never read stays unread.
 */
export function putUser(client: QueryClient, user: User): void {
  client.setQueryData(usersQuery.queryKey, (list) =>
    list && (list.some((u) => u.id === user.id) ? list.map((u) => (u.id === user.id ? user : u)) : [...list, user]),
  );
}
