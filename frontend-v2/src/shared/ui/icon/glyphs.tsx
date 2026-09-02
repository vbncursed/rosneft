// Paths lifted verbatim from the design system's Icons section. Each entry
// carries its own viewBox and stroke width — kebab is a 16px filled glyph, the
// rest are 24px strokes, and normalising them would redraw the shapes.
export const GLYPHS = {
  pencil: {
    box: "0 0 24 24",
    width: 1.7,
    body: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </>
    ),
  },
  trash: {
    box: "0 0 24 24",
    width: 1.7,
    body: (
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      </>
    ),
  },
  cube: {
    box: "0 0 24 24",
    width: 1.4,
    body: (
      <>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
      </>
    ),
  },
  eye: {
    box: "0 0 24 24",
    width: 1.7,
    body: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  "eye-off": {
    box: "0 0 24 24",
    width: 1.7,
    body: (
      <>
        <path d="M3 3l18 18" />
        <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
        <path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-3.2 4.2M6.1 6.1A18.5 18.5 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 3.9-.7" />
      </>
    ),
  },
  lock: {
    box: "0 0 24 24",
    width: 1.8,
    body: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
  },
  magnet: {
    box: "0 0 24 24",
    width: 2,
    body: (
      <>
        <path d="M5 3v8a7 7 0 0 0 14 0V3" />
        <path d="M5 3h4M15 3h4M5 7h4M15 7h4" />
      </>
    ),
  },
  plus: {
    box: "0 0 24 24",
    width: 1.8,
    body: <path d="M12 5v14M5 12h14" />,
  },
  refresh: {
    box: "0 0 24 24",
    width: 1.7,
    body: (
      <>
        <path d="M21 12a9 9 0 1 1-2.6-6.3" />
        <path d="M21 3v6h-6" />
      </>
    ),
  },
  ruler: {
    box: "0 0 24 24",
    width: 1.6,
    body: (
      <>
        <rect x="2" y="9" width="20" height="6" rx="1" />
        <path d="M6 9v3M9 9v2M12 9v3M15 9v2M18 9v3" />
      </>
    ),
  },
  calendar: {
    box: "0 0 24 24",
    width: 1.7,
    body: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M8 2v4M16 2v4M3 10h18" />
      </>
    ),
  },
  download: {
    box: "0 0 24 24",
    width: 1.7,
    body: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M4 21h16" />
      </>
    ),
  },
  moon: {
    box: "0 0 24 24",
    width: 1.8,
    body: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  },
  upload: {
    box: "0 0 24 24",
    width: 1.7,
    body: (
      <>
        <path d="M12 15V3" />
        <path d="m7 8 5-5 5 5" />
        <path d="M4 21h16" />
      </>
    ),
  },
  warning: {
    box: "0 0 24 24",
    width: 1.8,
    body: (
      <>
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </>
    ),
  },
  search: {
    box: "0 0 24 24",
    width: 1.8,
    body: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.6-3.6" />
      </>
    ),
  },
  kebab: {
    box: "0 0 16 16",
    width: 0,
    body: (
      <>
        <circle cx="8" cy="3" r="1.4" />
        <circle cx="8" cy="8" r="1.4" />
        <circle cx="8" cy="13" r="1.4" />
      </>
    ),
  },
} as const;

export type IconName = keyof typeof GLYPHS;

export const ICON_NAMES = Object.keys(GLYPHS) as IconName[];
