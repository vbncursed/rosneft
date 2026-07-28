interface CatalogCardProps {
  title: string;
  description?: string;
  slug: string;
  showOpen?: boolean;
}

// Presentational catalog card body. The route wraps it in a link (TanStack
// Link for existing routes, <a> otherwise) and overlays action buttons — this
// component stays link-agnostic so it works for territories and models alike.
export default function CatalogCard({ title, description, slug, showOpen = true }: CatalogCardProps) {
  return (
    <article className="group h-full rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur transition duration-300 hover:border-white/30 hover:bg-white/[0.06]">
      <h3 className="pr-36 text-2xl font-semibold tracking-tight text-white">{title}</h3>
      {description ? (
        <p className="mt-6 line-clamp-3 text-sm leading-6 text-neutral-300">{description}</p>
      ) : null}
      <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-4 text-sm text-neutral-400">
        <span>{slug}</span>
        {showOpen ? (
          <span className="transition duration-300 group-hover:translate-x-1 group-hover:text-white">Open</span>
        ) : null}
      </div>
    </article>
  );
}
