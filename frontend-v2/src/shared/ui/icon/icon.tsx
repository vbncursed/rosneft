import type { SVGProps } from "react";
import { GLYPHS, type IconName } from "./glyphs";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName;
  size?: number;
  /** Names the icon for assistive tech. Omit it and the icon is decorative. */
  title?: string;
};

export function Icon({ name, size = 20, title, ...rest }: IconProps) {
  const glyph = GLYPHS[name];
  const filled = glyph.width === 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={glyph.box}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? undefined : "currentColor"}
      strokeWidth={filled ? undefined : glyph.width}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {glyph.body}
    </svg>
  );
}
