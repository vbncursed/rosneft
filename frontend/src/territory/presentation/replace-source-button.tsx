// Links to the territory's replace-source flow. That route lands in the upload
// sub-plan; until then this is a plain <a> (full load, 404 until the route
// exists). Swap to TanStack <Link> when /territories/$slug/replace is added.
export default function ReplaceSourceButton({ slug }: { slug: string }) {
  return (
    <a
      href={`/territories/${encodeURIComponent(slug)}/replace`}
      aria-label="Replace source"
      title="Replace 3D source"
      className="cursor-pointer rounded-full border border-white/20 bg-white/[0.06] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-neutral-200 transition-colors duration-200 hover:bg-white/[0.12] hover:text-white"
    >
      Replace
    </a>
  );
}
