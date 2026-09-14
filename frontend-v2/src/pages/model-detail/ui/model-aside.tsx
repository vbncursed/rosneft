import { clsx as cx } from "clsx";
import { useRef } from "react";
import type { ConversionStatus } from "@/entities/conversion";
import type { Artifact } from "@/entities/content";
import { thumbnailUrl, type Model } from "@/entities/model";
import { ArtifactRow } from "@/shared/ui/artifact-row";
import { EmptyState } from "@/shared/ui/card";
import { DetailList } from "@/shared/ui/detail-list";
import { Icon } from "@/shared/ui/icon";
import { aboutRows, artifactRows } from "../model/detail";

export type ModelAsideProps = {
  model: Model;
  status: ConversionStatus;
  artifacts: Artifact[];
  jobError: string | null;
  canWrite: boolean;
  thumbnailBusy: boolean;
  onThumbnail: (file: File) => void;
  onRemoveThumbnail: () => void;
};

const OVERLINE = "font-mono text-[9px] uppercase tracking-[0.2em] text-muted";
// No gap here: each card sets its own (gap-3 or gap-3.5) alongside this, and
// two utilities on one property collide by the compiled stylesheet's source
// order, not by the className string's — see Button/Badge's own notes on it.
const CARD = "flex flex-col rounded-card border border-line bg-panel p-[18px]";
const ACTION = "font-mono text-[10px] uppercase tracking-[0.14em] text-accent";

function ArtifactsCard({ model, status, artifacts, jobError }: Pick<ModelAsideProps, "model" | "status" | "artifacts" | "jobError">) {
  return (
    <div className={`${CARD} gap-3`}>
      <div className="flex items-baseline justify-between">
        <p className={`m-0 ${OVERLINE}`}>Artifacts</p>
        {artifacts.length > 0 ? <p className="m-0 font-mono text-[10px] text-muted">{artifacts.length} LODs</p> : null}
      </div>
      {artifacts.length > 0 ? (
        artifactRows(model.slug, artifacts).map((r) => <ArtifactRow key={r.tag} {...r} />)
      ) : status === "failed" ? (
        <EmptyState
          layout="row"
          icon="cube"
          title="Conversion failed"
          description={jobError ?? "The worker rejected the archive."}
        />
      ) : (
        <EmptyState
          layout="row"
          icon="cube"
          title="Not converted yet"
          description="Artifacts appear when the conversion finishes."
        />
      )}
    </div>
  );
}

function ThumbnailCard({
  model,
  canWrite,
  thumbnailBusy,
  onThumbnail,
  onRemoveThumbnail,
}: Pick<ModelAsideProps, "model" | "canWrite" | "thumbnailBusy" | "onThumbnail" | "onRemoveThumbnail">) {
  const inputRef = useRef<HTMLInputElement>(null);
  const url = thumbnailUrl(model);

  return (
    <div className={`${CARD} gap-3`}>
      <div className="flex items-baseline justify-between">
        <p className={`m-0 ${OVERLINE}`}>Thumbnail</p>
        {canWrite ? (
          <div className="flex items-center gap-2.5">
            <button type="button" className={ACTION} disabled={thumbnailBusy} onClick={() => inputRef.current?.click()}>
              {thumbnailBusy ? "uploading…" : url ? "replace" : "upload"}
            </button>
            {url ? (
              <button type="button" className={ACTION} disabled={thumbnailBusy} onClick={onRemoveThumbnail}>
                remove
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-[13px]">
        <div className="flex size-[62px] shrink-0 items-center justify-center rounded-[10px] border border-line-2 bg-panel-2">
          {url ? (
            <img src={url} alt="" className="size-full rounded-[10px] object-cover" />
          ) : (
            <Icon name="cube" size={24} className="text-dim" />
          )}
        </div>
        <p className="m-0 text-[11px] leading-[1.45] text-muted">Shown in the library and the placement picker.</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Thumbnail file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onThumbnail(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** The right column: what the model is, its converted LODs, and its thumbnail. */
export function ModelAside({
  model,
  status,
  artifacts,
  jobError,
  canWrite,
  thumbnailBusy,
  onThumbnail,
  onRemoveThumbnail,
}: ModelAsideProps) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className={`${CARD} gap-3.5`}>
        <p className={`m-0 ${OVERLINE}`}>About</p>
        <p className={cx("m-0 text-[13px] leading-[1.6]", model.description ? "text-fg" : "text-muted")}>
          {model.description || "No description."}
        </p>
        <DetailList items={aboutRows(model, artifacts)} />
      </div>
      <ArtifactsCard model={model} status={status} artifacts={artifacts} jobError={jobError} />
      <ThumbnailCard
        model={model}
        canWrite={canWrite}
        thumbnailBusy={thumbnailBusy}
        onThumbnail={onThumbnail}
        onRemoveThumbnail={onRemoveThumbnail}
      />
    </div>
  );
}
