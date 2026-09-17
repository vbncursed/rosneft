import { QueryClient } from "@tanstack/react-query";
import { HttpError } from "@/shared/api";

/**
 * Retrying a 401 or a 403 buys nothing: by the time a retry would fire the
 * 401 has already bounced the user to /login, and a 403 will not change its
 * mind. Everything else gets one retry, which covers a dropped connection
 * without turning a real outage into four requests.
 *
 * Exported so it can be tested as a function rather than reached for through
 * the client's options.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
    return false;
  }
  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: shouldRetry } },
});
