import { useState } from "react";
import {
  PLAN_TOUR,
  PLAN_TOUR_STEPS,
  useTour,
  ZONE_CARD_TOUR,
  ZONE_CARD_TOUR_STEPS,
  type Tour,
  type TourStep,
} from "@/features/onboarding";

export type ZoneTours = {
  plan: Tour;
  card: Tour;
  /** Tells the hook what is on screen now: the plan editor, a selected zone's card. */
  want: (plan: boolean, card: boolean) => void;
  /** Any tour on screen, the viewer's and the panorama's included (`blocked`): the panel must stay open. */
  anyActive: boolean;
  /** The panel tab the running zone tour's step lives on. */
  tab: TourStep["tab"];
  /** The tour the rail's Replay restarts: the one for what is on screen, else the viewer's. */
  replayOf: (viewer: Tour) => Tour;
};

/**
 * The two first-run tours over the site-zones feature: the plan editor's (the
 * first time it opens) and the zone card's (the first time a zone is clicked).
 *
 * The tours must exist before the panel and the sections that follow their
 * steps, while what starts them — an open editor, a selected zone — is only
 * known after the zones hook, which needs those. So the page hands the facts
 * back through `want`, called while rendering: React re-renders the page at
 * once, before anything is committed, and `useTour` sees `ready` flip.
 * `seen` is undefined until the principal has answered, and a tour then
 * waits rather than being judged against a default.
 */
export function useZoneTours({ seen, blocked }: { seen: string[] | undefined; blocked: boolean }): ZoneTours {
  const [wantPlan, setWantPlan] = useState(false);
  const [wantCard, setWantCard] = useState(false);
  const known = seen !== undefined && !blocked;
  const plan = useTour(PLAN_TOUR, PLAN_TOUR_STEPS, {
    seen: seen?.includes(PLAN_TOUR) ?? true,
    ready: known && wantPlan,
  });
  // A card can be on screen under the open editor; it waits for the editor to close.
  const card = useTour(ZONE_CARD_TOUR, ZONE_CARD_TOUR_STEPS, {
    seen: seen?.includes(ZONE_CARD_TOUR) ?? true,
    ready: known && wantCard && !wantPlan,
  });
  const want = (planOn: boolean, cardOn: boolean) => {
    if (planOn !== wantPlan) setWantPlan(planOn);
    if (cardOn !== wantCard) setWantCard(cardOn);
  };
  const replayOf = (viewer: Tour) => (wantPlan ? plan : wantCard ? card : viewer);
  return {
    plan,
    card,
    want,
    anyActive: blocked || plan.active || card.active,
    tab: plan.step?.tab ?? card.step?.tab,
    replayOf,
  };
}
