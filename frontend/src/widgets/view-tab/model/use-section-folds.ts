import { useCallback, useState } from "react";

/** The two View-tab sections whose list folds. */
export type FoldedSection = "panoramas" | "documents";

/** One section head's fold: whether the list shows, and the head's click. */
export type SectionFold = { open: boolean; onToggle: () => void };

const KEY: Record<FoldedSection, string> = {
  panoramas: "andrey.view.panoramas",
  documents: "andrey.view.documents",
};

// Absence means folded: a reader who never opened a list is not handed fifteen
// thumbnails. Only the open choice is worth storing.
const storedOpen = (section: FoldedSection): boolean => {
  try {
    return localStorage.getItem(KEY[section]) === "open";
  } catch {
    // Private windows and blocked site data throw on read; folded is fine.
    return false;
  }
};

const remember = (section: FoldedSection, open: boolean) => {
  try {
    if (open) localStorage.setItem(KEY[section], "open");
    else localStorage.removeItem(KEY[section]);
  } catch {
    // A remembered fold is a convenience, not something to fail over.
  }
};

/**
 * The View tab's Panoramas and Documents folds, remembered per browser.
 *
 * `forced` opens a section without touching what was remembered — standing in
 * or editing a panorama, or a running tour whose anchors live in the list. It
 * is applied during render, not from an effect, so a tour step and the list it
 * points into land in the same commit (the `useOverlaysPanel` pattern).
 *
 * Lifted to the page rather than kept in `ViewTab` because the rail's tiles
 * open a section too: `reveal`.
 */
export function useSectionFolds(forced: Record<FoldedSection, boolean>) {
  const [stored, setStored] = useState(() => ({
    panoramas: storedOpen("panoramas"),
    documents: storedOpen("documents"),
  }));

  // The write stays out of the updater: StrictMode double-invokes those.
  const set = useCallback((section: FoldedSection, open: boolean) => {
    remember(section, open);
    setStored((s) => ({ ...s, [section]: open }));
  }, []);
  const reveal = useCallback((section: FoldedSection) => set(section, true), [set]);

  const fold = (section: FoldedSection): SectionFold => {
    const open = forced[section] || stored[section];
    return { open, onToggle: () => set(section, !open) };
  };

  return { panoramas: fold("panoramas"), documents: fold("documents"), reveal };
}
