/**
 * The error of a query that has never answered — null while it holds data.
 *
 * TanStack Query v5 flips a query's `status` to "error" when a *background*
 * refetch fails, and leaves `data` where it was. Deriving "unavailable" from
 * `isError` therefore blanks a populated screen the first time a refresh
 * trips; only a query with nothing to show is really unavailable.
 */
export const unanswered = <E>(query: { data: unknown; error: E | null }): E | null =>
  query.data === undefined ? query.error : null;
