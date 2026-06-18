import Link from "next/link";

interface ReplaceSourceButtonProps {
  slug: string;
}

// ReplaceSourceButton links to the territory's replace-source flow. Sits in
// the card's top-right action cluster next to delete.
export default function ReplaceSourceButton({ slug }: ReplaceSourceButtonProps) {
  return (
    <Link
      href={`/territories/${encodeURIComponent(slug)}/replace`}
      aria-label="Replace source"
      title="Replace 3D source"
      className="cursor-pointer rounded-full border border-white/20 bg-white/[0.06] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-neutral-200 transition-colors duration-200 hover:bg-white/[0.12] hover:text-white"
    >
      Replace
    </Link>
  );
}
