import { TerritoryCard, territoryPath, type TerritoryCardModel } from "@/entities/territory";
import { ThemeToggle } from "@/features/theme-toggle";
import { FilterBar } from "@/features/audit-filter";
import { EmptyState } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Segmented } from "@/shared/ui/segmented";
import { PageHeader } from "@/widgets/page-header";
import type { TerritoryTab } from "../model/catalog";

export type TerritoryCatalogPageProps = {
  cards: TerritoryCardModel[];
  tab: TerritoryTab;
  counts: Record<TerritoryTab, number>;
  onTabChange: (tab: TerritoryTab) => void;
  query: string;
  onQueryChange: (query: string) => void;
  canUpload: boolean;
  canDelete: boolean;
  canReplace: boolean;
  onUpload: () => void;
  onOpen: (slug: string) => void;
  onReplace: (slug: string) => void;
  onDelete: (slug: string) => void;
  /** What the list says when it is empty — a filter miss by default. */
  emptyHint?: string;
};

export function TerritoryCatalogPage({
  cards,
  tab,
  counts,
  onTabChange,
  query,
  onQueryChange,
  canUpload,
  canDelete,
  canReplace,
  onUpload,
  onOpen,
  onReplace,
  onDelete,
  emptyHint,
}: TerritoryCatalogPageProps) {
  return (
    <>
      <PageHeader
        size="xl"
        eyebrow="Territory catalog"
        title="Scenes to walk through"
        description="Sites you have access to. Open one to inspect it in 3D, measure distances and place models."
        action={
          <div className="flex items-center gap-[9px]">
            <ThemeToggle variant="compact" />
            {canUpload ? (
              <Button variant="primary" shape="pill" onClick={onUpload}>
                + Upload
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <FilterBar
          query={query}
          onChange={onQueryChange}
          label="Filter territories"
          placeholder="filter: state:ready panorama:yes"
          className="flex-1 basis-[18rem]"
        />
        <Segmented
          tone="soft"
          fill={false}
          mono
          ariaLabel="Show"
          className="bg-panel"
          value={tab}
          onChange={onTabChange}
          items={[
            { value: "all" as const, label: `All · ${counts.all}` },
            { value: "ready" as const, label: `Ready · ${counts.ready}` },
            { value: "converting" as const, label: `Converting · ${counts.converting}` },
          ]}
        />
      </div>

      {cards.length === 0 ? (
        <EmptyState
          title={emptyHint ?? "Nothing matches this filter."}
          description={emptyHint ? undefined : "Loosen the filter to see more of the catalog."}
        />
      ) : (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {cards.map((card) => (
            <TerritoryCard
              key={card.slug}
              card={card}
              href={territoryPath(card.slug)}
              onOpen={() => onOpen(card.slug)}
              actions={
                canReplace || canDelete ? (
                  <>
                    {canReplace ? (
                      <Button
                        shape="icon"
                        size="sm"
                        variant="secondary"
                        aria-label={`Replace source of ${card.title}`}
                        onClick={() => onReplace(card.slug)}
                      >
                        <Icon name="refresh" size={14} />
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button
                        shape="icon"
                        size="sm"
                        variant="secondary"
                        aria-label={`Delete ${card.title}`}
                        onClick={() => onDelete(card.slug)}
                      >
                        <Icon name="trash" size={14} />
                      </Button>
                    ) : null}
                  </>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      {canUpload ? (
        <EmptyState
          layout="row"
          icon="plus"
          title="Add another territory"
          description="ZIP with OBJ + MTL + textures — conversion starts automatically."
          action={
            <Button variant="accent" shape="pill" size="sm" onClick={onUpload}>
              Upload territory
            </Button>
          }
        />
      ) : null}
    </>
  );
}
