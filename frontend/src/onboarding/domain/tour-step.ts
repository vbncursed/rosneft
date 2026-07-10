// A single stop in a guided tour. `id` doubles as the value of the target's
// `data-tour` attribute — the tour finds the element by that attribute rather
// than by a React ref, so nothing has to be threaded through memoized
// components.
export interface TourStep {
  id: string;
  title: string;
  body: string;
  // The OverlaysPanel tab this step's target lives on. The tour switches to it
  // before looking the target up, because an inactive tab is not in the DOM.
  tab?: "view" | "placements";
  // Describes the page rather than one control: rendered centred, no spotlight,
  // no `data-tour` target to find.
  center?: true;
}
