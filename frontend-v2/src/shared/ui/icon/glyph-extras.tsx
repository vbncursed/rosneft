/**
 * The catalog/upload glyphs, added later than the rest of the registry and
 * kept in their own file so ./glyphs.tsx — already near the 200-line cap —
 * does not have to grow every time a new screen needs an icon.
 */
export const EXTRA_GLYPHS = {
  minus: {
    box: "0 0 24 24",
    width: 2.2,
    body: <path d="M6 12h12" />,
  },
  grid: {
    box: "0 0 24 24",
    width: 1.8,
    body: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
  },
  list: {
    box: "0 0 24 24",
    width: 1.8,
    body: <path d="M4 6h16M4 12h16M4 18h16" />,
  },
  "arrow-right": {
    box: "0 0 24 24",
    width: 2,
    body: <path d="M5 12h14M13 6l6 6-6 6" />,
  },
  "chevron-left": {
    box: "0 0 24 24",
    width: 2,
    body: <path d="m14 6-6 6 6 6" />,
  },
  "chevron-right": {
    box: "0 0 24 24",
    width: 2,
    body: <path d="m10 6 6 6-6 6" />,
  },
  "chevron-up": {
    box: "0 0 24 24",
    width: 2,
    body: <path d="m6 15 6-6 6 6" />,
  },
  // A 2:1 frame with the horizon: the panorama thumb and the upload card.
  panorama: {
    box: "0 0 24 24",
    width: 1.6,
    body: (
      <>
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M2 12c3.5-2 6.5-2 10 0s6.5 2 10 0" />
      </>
    ),
  },
  file: {
    box: "0 0 24 24",
    width: 1.7,
    body: (
      <>
        <path d="M7 3h7l5 5v13H7z" />
        <path d="M14 3v5h5" />
      </>
    ),
  },
  maximize: {
    box: "0 0 24 24",
    width: 2,
    body: <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" />,
  },
  minimize: {
    box: "0 0 24 24",
    width: 2,
    body: <path d="M3 8h5V3M21 8h-5V3M16 21v-5h5M8 21v-5H3" />,
  },
  // Three 14×1 lines — the mock's drag handle.
  grip: {
    box: "0 0 24 24",
    width: 1.5,
    body: <path d="M5 8h14M5 12h14M5 16h14" />,
  },
  "arrow-up": {
    box: "0 0 24 24",
    width: 2,
    body: <path d="M12 19V5M6 11l6-6 6 6" />,
  },
  // No existing x/close glyph in GLYPHS or EXTRA_GLYPHS — added per the
  // pre-flight ruling, same shape as the design system's dialog dismiss.
  close: {
    box: "0 0 24 24",
    width: 2,
    body: <path d="M6 6l12 12M18 6 6 18" />,
  },
} as const;
