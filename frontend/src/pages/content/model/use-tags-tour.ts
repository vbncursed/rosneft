import { TAGS_TOUR, TAGS_TOUR_STEPS, useTour, type Tour } from "@/features/onboarding";

/**
 * The Tags card's first-run tour. `seen` is undefined until the principal has
 * answered, and the tour then waits instead of being judged against a default;
 * `ready` is "the card is on the page" (a tag manager, lists loaded).
 */
export function useTagsTour({ seen, ready }: { seen: string[] | undefined; ready: boolean }): Tour {
  return useTour(TAGS_TOUR, TAGS_TOUR_STEPS, {
    seen: seen?.includes(TAGS_TOUR) ?? true,
    ready: ready && seen !== undefined,
  });
}
