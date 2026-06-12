import { memo } from "react";

interface ExternalPanoramaLinkProps {
  // The territory's externally-hosted panorama URL. Absent/empty renders
  // nothing — the button only exists when an operator configured a link.
  url?: string;
}

// ExternalPanoramaLink is a standalone right-rail overlay button that opens
// a territory's externally-hosted 360° tour in a new tab. It deliberately
// mirrors the glass-overlay style (rounded-xl, translucent, backdrop-blur)
// of the panorama toolbar so the right rail reads as one visual family.
function ExternalPanoramaLinkImpl({ url }: ExternalPanoramaLinkProps) {
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="pointer-events-auto inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/20 bg-black/50 px-4 py-2 text-sm font-medium text-white shadow-xl backdrop-blur transition-colors hover:bg-black/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 3h6v6" />
        <path d="M10 14 21 3" />
        <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
      </svg>
      <span>Panorama tour</span>
    </a>
  );
}

export default memo(ExternalPanoramaLinkImpl);
