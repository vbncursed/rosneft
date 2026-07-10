// Tour ids are persisted per user (`onboardingToursSeen`), so they are part of
// the stored data — renaming one replays that tour for everyone who saw it.
// The backend validates only their shape, never this list.
export const VIEWER_TOUR = "viewer";
export const PANORAMA_TOUR = "panorama";
