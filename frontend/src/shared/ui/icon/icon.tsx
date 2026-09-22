import type { SVGProps } from "react";
import { GLYPHS, type IconName } from "./glyphs";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName;
  size?: number;
  /** Names the icon for assistive tech. Omit it and the icon is decorative. */
  title?: string;
};

// Every glyph is a runeicons / Lucide outline on the same 24 grid, so the grid
// and the stroke live here, once — see ./NOTICE for where each drawing is from.
export function Icon({ name, size = 20, title, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {GLYPHS[name].body}
    </svg>
  );
}
