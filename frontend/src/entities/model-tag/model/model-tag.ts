/** One entry of the gateway's fixed tag list; code refers to a tag by its slug. */
export type ModelTag = { slug: string; title: string };

/** The catch-all tag. A model may carry it; a zone may not. */
export const UNGROUPED_TAG_SLUG = "ungrouped";
