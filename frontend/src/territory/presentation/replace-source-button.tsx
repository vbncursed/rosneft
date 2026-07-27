import { Link } from "@tanstack/react-router";

// Links to the territory's replace-source flow (route now exists).
export default function ReplaceSourceButton({ slug }: { slug: string }) {
  return (
    <Link
      to="/territories/$slug/replace"
      params={{ slug }}
      aria-label="Replace source"
      title="Replace 3D source"
      className="cursor-pointer rounded-full border border-white/20 bg-white/[0.06] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-neutral-200 transition-colors duration-200 hover:bg-white/[0.12] hover:text-white"
    >
      Replace
    </Link>
  );
}
