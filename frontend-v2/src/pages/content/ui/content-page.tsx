import type { ReactNode } from "react";
import type { ContentItem } from "@/entities/content";
import type { ConversionStage } from "@/entities/conversion";
import { StatTile, type StatTileTone } from "@/entities/metric";
import { FilterBar, type ExtraFilter } from "@/features/audit-filter";
import { Button } from "@/shared/ui/button";
import { CoverageMeter, type CoverageSegment } from "@/shared/ui/coverage-meter";
import type { Detail } from "@/shared/ui/detail-list";
import { ContentGroups, type ContentGroup } from "@/widgets/content-groups";
import { ContentInspector } from "@/widgets/content-inspector";
import { PageHeader } from "@/widgets/page-header";

export type ContentPageStat = {
  label: string;
  value: string;
  hint: string;
  tone?: StatTileTone;
};

/** The item open in the inspector, with what the route resolved about it. */
export type InspectedContent = {
  item: ContentItem;
  details: Detail[];
  stages?: ConversionStage[];
  conversionNote?: string;
};

export type ContentPageProps = {
  groups: ContentGroup[];
  pipeline: { label: string; detail: string; segments: CoverageSegment[] };
  stats: ContentPageStat[];

  query: string;
  onQueryChange: (query: string) => void;
  extraFilters?: ExtraFilter[];

  selectedSlug: string | null;
  onSelect: (item: ContentItem) => void;
  onCloseInspector: () => void;
  /** Absent while the selected item's detail is still loading. */
  inspected?: InspectedContent | null;
  renderRowActions?: (item: ContentItem) => ReactNode;

  onUploadTerritory: () => void;
  onUploadModel: () => void;
  /** Absent for a model — there is no source-replace route for one. */
  onReplaceSource?: () => void;
  onOpenInViewer: () => void;
  /** Whether the inspected item has anything to open; its status if absent. */
  openable?: boolean;
  /** Absent when the viewer may not delete this kind. */
  onDelete?: () => void;
  onCancelJob?: () => void;
  canManage?: boolean;
  /** What the list says when it is empty — a filter miss by default. */
  emptyHint?: string;
};

const FILTER_PLACEHOLDER = "filter: kind:territory status:converting lod:2";

export function ContentPage({
  groups,
  pipeline,
  stats,
  query,
  onQueryChange,
  extraFilters,
  selectedSlug,
  onSelect,
  onCloseInspector,
  inspected,
  renderRowActions,
  onUploadTerritory,
  onUploadModel,
  onReplaceSource,
  onOpenInViewer,
  openable,
  onDelete,
  onCancelJob,
  canManage = true,
  emptyHint,
}: ContentPageProps) {
  return (
    <>
      <PageHeader
        size="lg"
        eyebrow="Catalog · conversion pipeline"
        title="Content"
        action={
          canManage ? (
            <div className="flex gap-2.5">
              <Button onClick={onUploadModel}>+ Model</Button>
              <Button variant="primary" onClick={onUploadTerritory}>
                + Territory
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
        <CoverageMeter
          label={pipeline.label}
          detail={pipeline.detail}
          detailTone="ok"
          segments={pipeline.segments}
          className="rounded-[11px] border border-line bg-panel px-4.5 py-4"
        />
        {stats.map((stat) => (
          <StatTile
            key={stat.label}
            size="lg"
            label={stat.label}
            state={{ kind: "value", value: stat.value }}
            hint={stat.hint}
            tone={stat.tone ?? "fg"}
          />
        ))}
      </div>

      <FilterBar
        query={query}
        onChange={onQueryChange}
        extra={extraFilters}
        label="Filter content"
        placeholder={FILTER_PLACEHOLDER}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(420px,1fr)_minmax(300px,380px)]">
        <ContentGroups
          groups={groups}
          selectedSlug={selectedSlug}
          onSelect={onSelect}
          renderActions={renderRowActions}
          onDropZoneClick={canManage ? onUploadTerritory : undefined}
          {...(emptyHint ? { emptyHint } : {})}
        />

        {inspected ? (
          // Sticky so the item stays readable while the catalog scrolls.
          <div className="xl:sticky xl:top-6">
            <ContentInspector
              item={inspected.item}
              details={inspected.details}
              stages={inspected.stages}
              conversionNote={inspected.conversionNote}
              canManage={canManage}
              onClose={onCloseInspector}
              onReplaceSource={onReplaceSource}
              onOpenInViewer={onOpenInViewer}
              openable={openable}
              onDelete={onDelete}
              onCancelJob={inspected.item.status === "converting" ? onCancelJob : undefined}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
