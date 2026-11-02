import type { ReactNode } from "react";
import type { ContentItem } from "@/entities/content";
import type { ConversionStage } from "@/entities/conversion";
import type { StatTileTone } from "@/entities/metric";
import { FilterBar, type ExtraFilter } from "@/features/audit-filter";
import { Button } from "@/shared/ui/button";
import type { CoverageSegment } from "@/shared/ui/coverage-meter";
import type { Detail } from "@/shared/ui/detail-list";
import { Icon } from "@/shared/ui/icon";
import { ContentGroups, type ContentGroup } from "@/widgets/content-groups";
import { ContentInspector } from "@/widgets/content-inspector";
import { PageHeader } from "@/widgets/page-header";
import { StatsRow } from "@/widgets/stats-row";

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

  /** Absent when the viewer may not create a territory: no button, no drop target. */
  onUploadTerritory?: () => void;
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
              <Button aria-label="New model" onClick={onUploadModel}>
                <Icon name="plus" size={14} />
                Model
              </Button>
              {onUploadTerritory ? (
                <Button variant="primary" aria-label="New territory" onClick={onUploadTerritory}>
                  <Icon name="plus" size={14} />
                  Territory
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <StatsRow meter={pipeline} detailTone="ok" stats={stats} />

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
          <div className="transition-opacity duration-150 starting:opacity-0 xl:sticky xl:top-6">
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
