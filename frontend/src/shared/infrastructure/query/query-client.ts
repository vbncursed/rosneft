import { QueryClient } from "@tanstack/react-query";

// Shared query client. staleTime keeps the current-user and future list
// queries from refetching on every mount; retry:1 avoids hammering the gateway
// on a hard failure. Tune per-query later if needed.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});
