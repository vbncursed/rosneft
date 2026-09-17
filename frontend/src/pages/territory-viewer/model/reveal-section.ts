/** The two sections of the View tab a rail tile can point at. */
export type Section = "panoramas" | "documents";

/** The anchor `ViewTab` marks each section with. */
export const sectionId = (section: Section) => `view-tab-${section}`;

/**
 * Brings one section of the View tab into view.
 *
 * The rail's Panoramas and Documents tiles switch the panel to that tab and
 * unfold it in the same click, so the section they aim at is not in the DOM
 * until React has committed both — which is why the look-up waits a frame
 * rather than running now. A section that is still not there (a failed mesh
 * drops the panel entirely) is left alone: the tile did what it could.
 */
export function revealSection(
  section: Section,
  root: Pick<Document, "getElementById"> = document,
  frame: (fn: () => void) => void = requestAnimationFrame,
): void {
  frame(() => root.getElementById(sectionId(section))?.scrollIntoView?.({ block: "start" }));
}
