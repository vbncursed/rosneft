import { countByKind, ContentCard, type ContentItem, type ContentTab } from "@/entities/content";
import type { ConversionJob } from "@/entities/conversion";
import { StatTile, type StatTileTone } from "@/entities/metric";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/card";
import { SearchField } from "@/shared/ui/search-field";
import { Tabs } from "@/shared/ui/tabs";
import { ConversionQueue } from "@/widgets/conversion-queue";
import { PageHeader } from "@/widgets/page-header";

export type ContentPageStat = {
  label: string;
  value: string;
  hint: string;
  tone?: StatTileTone;
};

export type ContentPageProps = {
  /** Already filtered by the route; the tab counts come from `counts`. */
  items: ContentItem[];
  /** Totals for the tab labels, which do not shrink as the query narrows. */
  counts: ReturnType<typeof countByKind>;
  stats: ContentPageStat[];
  jobs: ConversionJob[];

  tab: ContentTab;
  onTabChange: (tab: ContentTab) => void;
  query: string;
  onQueryChange: (query: string) => void;

  onUploadTerritory: () => void;
  onUploadModel: () => void;
  onReplace?: (item: ContentItem) => void;
  onDelete?: (item: ContentItem) => void;
  canManage?: boolean;
};

export function ContentPage({
  items,
  counts,
  stats,
  jobs,
  tab,
  onTabChange,
  query,
  onQueryChange,
  onUploadTerritory,
  onUploadModel,
  onReplace,
  onDelete,
  canManage = true,
}: ContentPageProps) {
  return (
    <>
      <PageHeader
        size="lg"
        eyebrow="Catalog"
        title="Content"
        description="Territories, models and their conversion artifacts."
        action={
          canManage ? (
            <div className="flex gap-2.5">
              <Button onClick={onUploadModel}>+ Upload model</Button>
              <Button variant="primary" onClick={onUploadTerritory}>
                + Upload territory
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs
          ariaLabel="Content kind"
          value={tab}
          onChange={onTabChange}
          className="flex-1"
          tabs={[
            { value: "all", label: `All · ${counts.all}` },
            { value: "territory", label: `Territories · ${counts.territory}` },
            { value: "model", label: `Models · ${counts.model}` },
          ]}
        />
        <SearchField
          value={query}
          onChange={onQueryChange}
          label="Search content"
          placeholder="title or slug"
          className="min-w-60"
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          description="Try a different search, or upload something new."
          action={
            canManage ? (
              <Button variant="primary" size="sm" onClick={onUploadTerritory}>
                + Upload territory
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <ContentCard
              key={`${item.kind}:${item.slug}`}
              item={item}
              onReplace={canManage && onReplace ? () => onReplace(item) : undefined}
              onDelete={canManage && onDelete ? () => onDelete(item) : undefined}
            />
          ))}
        </div>
      )}

      <ConversionQueue jobs={jobs} />
    </>
  );
}
