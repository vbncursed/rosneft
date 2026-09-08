import { useParams, useSearch } from "@tanstack/react-router";
import { Callout } from "@/shared/ui/callout";
import { EmptyState } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import { useTerritoryConversion } from "../model/use-territory-conversion";
import { TerritoryConversionPage } from "./territory-conversion-page";

/** Maps the container onto the page — loading skeleton, not-found, unavailable, or the page. */
export function TerritoryConversionScreen() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const { jobId } = useSearch({ strict: false }) as { jobId?: string };
  const s = useTerritoryConversion(slug, jobId ?? null);

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
    <TerritoryConversionPage
      territory={s.territory}
      phase={s.phase}
      job={s.job}
      hasLod0={s.hasLod0}
      onOpenViewer={s.onOpenViewer}
    />
  );
}
