export type LinkButtonVariant = "primary" | "secondary";

// The same frame, focus ring and hit area `shared/ui/button` gives a control,
// for the places where the control is an `<a>`: a link the browser must treat
// as a navigation, drawn as the button beside it. A mixed set that behaves two
// ways is worse than either.
//
// One property, one place: `clsx` concatenates, and two utilities for the same
// property are resolved by the compiled stylesheet's own source order rather
// than the string's — so the ground, the text colour and the border colour are
// each declared once, per variant, and never overridden here.
const CONTROL =
  "inline-flex cursor-pointer items-center rounded-control border px-[18px] py-2.5 text-[13px] no-underline transition-[color,background-color,border-color,scale] duration-150 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const PRIMARY = `${CONTROL} border-accent bg-accent font-semibold text-accent-fg hover:bg-accent/90`;
const SECONDARY = `${CONTROL} border-line-2 bg-panel-2 font-medium text-fg hover:border-accent-line`;

/** The class list for an `<a>` that has to read as a button. */
export const linkButtonClass = (variant: LinkButtonVariant): string =>
  variant === "primary" ? PRIMARY : SECONDARY;
