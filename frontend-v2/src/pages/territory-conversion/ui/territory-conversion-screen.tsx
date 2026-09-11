import { useParams, useSearch } from "@tanstack/react-router";
import { Callout } from "@/shared/ui/callout";
import { EmptyState } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import { useTerritoryConversion } from "../model/use-territory-conversion";
import { TerritoryConversionPage } from "./territory-conversion-page";

/** Maps the container onto the page — loading skeleton, not-found, unavailable, or the page. */
function TerritoryConversionBody({ slug, jobId }: { slug: string; jobId: string | null }) {
  const s = useTerritoryConversion(slug, jobId);

  if (s.status === "loading") {
    return (
      <div role="status" aria-busy="true" aria-label="Loading territory" className="flex flex-col gap-3">
        <Skeleton height="34px" width="30%" />
        <Skeleton height="200px" />
      </div>
    );
  }

  if (s.status === "missing") {
    return (
      <EmptyState
        title="Territory not found"
        action={
          <a href="/territories" className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted no-underline hover:text-fg">
            ← Territory catalog
          </a>
        }
      />
    );
  }

  if (s.status === "unavailable") {
    return <Callout tone="bad">Territory unavailable: {s.error}</Callout>;
  }

  return (
    <TerritoryConversionPage territory={s.territory} phase={s.phase} job={s.job} hasLod0={s.hasLod0} />
  );
}

/**
 * The route component. The router keeps one instance across a `$slug` change,
 * so the body is keyed on the slug: the container's refs (previous jobs) and
 * the stream's frame belong to one territory and must not carry into the next.
 *
 * This route shares its URL with the viewer, so the shell hands it the
 * `viewport` layout — a padding-free `h-dvh overflow-hidden` column. The
 * column this page is written for lives here instead, around all four states
 * rather than only the ready one: a skeleton flush against the window edge is
 * as wrong as a page one.
 */
export function TerritoryConversionScreen() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const { jobId } = useSearch({ strict: false }) as { jobId?: string };
  return (
    <div className="mx-auto min-h-0 w-full max-w-[760px] overflow-auto px-9 pb-[72px] pt-8">
      <TerritoryConversionBody key={slug} slug={slug} jobId={jobId ?? null} />
    </div>
  );
}
