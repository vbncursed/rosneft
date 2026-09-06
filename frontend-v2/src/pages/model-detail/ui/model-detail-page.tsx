import type { ConversionStatus } from "@/entities/conversion";
import { assetUrl } from "@/entities/content";
import { thumbnailUrl } from "@/entities/model";
import { ThemeToggle } from "@/features/theme-toggle";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { PageHeader } from "@/widgets/page-header";
import { artifactFile, headerMeta, lod0, type ModelDetailPageProps } from "../model/detail";
import { ModelAside } from "./model-aside";
import { ModelViewport } from "./model-viewport";

export type { ModelDetailPageProps };

const BADGE_TONE: Record<ConversionStatus, "ok" | "warn" | "bad" | "dim"> = {
  ready: "ok",
  converting: "warn",
  failed: "bad",
  pending: "dim",
};

/** The model page: header (status, download, delete) plus the thumbnail viewport and its facts. */
export function ModelDetailPage({
  model,
  status,
  artifacts,
  jobError,
  canDelete,
  canWrite,
  thumbnailBusy,
  onDelete,
  onThumbnail,
  onRemoveThumbnail,
}: ModelDetailPageProps) {
  const base = lod0(artifacts);

  return (
    <>
      <PageHeader
        eyebrow="Model"
        title={model.title}
        titleBadge={
          <Badge tone={BADGE_TONE[status]} size="sm">
            {status}
          </Badge>
        }
        meta={headerMeta(model, artifacts)}
        back={{ label: "← Model library", href: "/models" }}
        action={
          <div className="flex shrink-0 items-center gap-[9px]">
            <ThemeToggle variant="compact" />
            {base ? (
              <a
                href={assetUrl(base.hash)}
                download={artifactFile(model.slug, 0)}
                className="inline-flex items-center gap-[7px] rounded-control border border-line-2 bg-panel-2 px-3.5 py-2 text-[13px] text-fg no-underline hover:border-accent-line"
              >
                <Icon name="download" size={14} />
                Download GLB
              </a>
            ) : null}
            {canDelete ? (
              <Button
                shape="icon"
                variant="danger"
                aria-label="Delete model"
                disabled={model.usageCount > 0}
                title={model.usageCount > 0 ? `In use on ${model.usageCount} territories` : undefined}
                onClick={onDelete}
              >
                <Icon name="trash" size={14} />
              </Button>
            ) : null}
          </div>
        }
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(420px,1fr)_minmax(300px,360px)]">
        <ModelViewport title={model.title} thumbnailUrl={thumbnailUrl(model)} />
        <ModelAside
          model={model}
          status={status}
          artifacts={artifacts}
          jobError={jobError}
          canWrite={canWrite}
          thumbnailBusy={thumbnailBusy}
          onThumbnail={onThumbnail}
          onRemoveThumbnail={onRemoveThumbnail}
        />
      </div>
    </>
  );
}
