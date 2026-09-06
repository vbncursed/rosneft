import { useParams } from "@tanstack/react-router";
import { Callout } from "@/shared/ui/callout";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { EmptyState } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import { useModelDetail } from "../model/use-model-detail";
import { ModelDetailPage } from "./model-detail-page";

/** Maps the container onto the page — loading skeleton, not-found, unavailable, or the page plus its delete dialog. */
export function ModelDetailScreen() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const s = useModelDetail(slug);

  if (s.phase === "loading") {
    return (
      <div role="status" aria-busy="true" aria-label="Loading model" className="flex flex-col gap-3">
        <Skeleton height="28px" width="30%" />
        <Skeleton height="560px" />
      </div>
    );
  }

  if (s.phase === "missing") {
    return (
      <EmptyState
        title="Model not found"
        action={
          <a href="/models" className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted no-underline hover:text-fg">
            ← Model library
          </a>
        }
      />
    );
  }

  if (s.phase === "unavailable") {
    return <Callout tone="bad">Model unavailable: {s.error}</Callout>;
  }

  return (
    <>
      <ModelDetailPage
        model={s.model}
        status={s.status}
        artifacts={s.artifacts}
        jobError={s.jobError}
        canDelete={s.canDelete}
        canWrite={s.canWrite}
        thumbnailBusy={s.thumbnailBusy}
        onDelete={s.onDelete}
        onThumbnail={s.onThumbnail}
        onRemoveThumbnail={s.onRemoveThumbnail}
      />
      {s.pending ? (
        <ConfirmDialog
          open
          title={`Delete ${s.model.title}?`}
          description="This cannot be undone."
          confirmLabel="Delete"
          tone="danger"
          busy={s.deleteBusy}
          onConfirm={s.confirm}
          onCancel={s.dismiss}
        />
      ) : null}
    </>
  );
}
