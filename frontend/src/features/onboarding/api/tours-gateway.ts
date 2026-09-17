import { httpPost } from "@/shared/api";

/** One POST when a tour ends, finished or skipped; the server keeps the id. */
export const markTourSeen = (tour: string): Promise<void> =>
  httpPost<void>(`/api/auth/me/onboarding/${encodeURIComponent(tour)}`);
