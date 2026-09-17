/**
 * The `--overlays-w` declaration for the panel's current state: 320px open,
 * 300 at 1280 and below, 44px collapsed.
 *
 * It is a string rather than a style object because a CSS variable set from a
 * media query cannot be written inline. The panel's root applies it, and so
 * does the page's viewport container — a CSS variable inherits downward only,
 * so the LOD switcher, which is the panel's sibling rather than its child,
 * needs the same declaration on an element of its own.
 *
 * Tailwind v4 compiles `max-[N]` to `width < N`, so the mock's "300 at 1280"
 * is spelled `max-[1281px]`.
 */
export const overlaysWidthClass = (collapsed: boolean): string =>
  collapsed ? "[--overlays-w:44px]" : "[--overlays-w:320px] max-[1281px]:[--overlays-w:300px]";
