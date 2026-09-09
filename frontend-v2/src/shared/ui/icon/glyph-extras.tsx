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
} as const;
