import { useParams } from "@tanstack/react-router";
import { Callout } from "@/shared/ui/callout";
import { EmptyState } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import { useReplaceSource } from "../model/use-replace-source";
import { ReplaceSourcePage } from "./replace-source-page";

/** Maps the container onto the props-only page. No dialogs of its own. */
export function ReplaceSourceScreen() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const s = useReplaceSource(slug);

  if (s.status === "loading") {
    return (
      <div role="status" aria-busy="true" aria-label="Loading territory" className="flex flex-col gap-3">
        <Skeleton height="28px" width="30%" />
        <Skeleton height="96px" />
        <Skeleton height="96px" />
      </div>
    );
  }

  if (s.status === "missing") {
    return (
      <EmptyState
        title="Territory not found"
        action={
          <a
            href="/territories"
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted no-underline hover:text-fg"
          >
            ← Territory catalog
          </a>
        }
      />
    );
  }

  if (s.status === "unavailable") {
    return <Callout tone="bad">Territory unavailable: {s.error}</Callout>;
  }

  return <ReplaceSourcePage {...s} />;
}
