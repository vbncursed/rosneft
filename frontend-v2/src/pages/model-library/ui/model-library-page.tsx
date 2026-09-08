import { ModelCard, modelPath, type ModelCardModel } from "@/entities/model";
import { ThemeToggle } from "@/features/theme-toggle";
import { FilterBar } from "@/features/audit-filter";
import { EmptyState } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Segmented } from "@/shared/ui/segmented";
import { PageHeader } from "@/widgets/page-header";
import type { ModelTab } from "../model/catalog";

export type ModelLibraryPageProps = {
  cards: ModelCardModel[];
  tab: ModelTab;
  counts: Record<ModelTab, number>;
  onTabChange: (tab: ModelTab) => void;
  query: string;
  onQueryChange: (query: string) => void;
  canUpload: boolean;
  canDelete: boolean;
  onUpload: () => void;
  onOpen: (slug: string) => void;
  onDelete: (slug: string) => void;
  /** What the list says when it is empty — a filter miss by default. */
  emptyHint?: string;
};

export function ModelLibraryPage({
  cards,
  tab,
  counts,
  onTabChange,
  query,
  onQueryChange,
  canUpload,
  canDelete,
  onUpload,
  onOpen,
  onDelete,
  emptyHint,
}: ModelLibraryPageProps) {
  return (
    <>
      <PageHeader
        size="xl"
        eyebrow="Model catalog"
        title="Models for placement"
        description="Reusable equipment you can drop onto any territory. Thumbnails come from the model detail page."
        back={{ label: "← Home", href: "/" }}
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
          label="Filter models"
          placeholder="filter: thumbnail:none used:0 lod:2"
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
            { value: "inUse" as const, label: `In use · ${counts.inUse}` },
            { value: "noImage" as const, label: `No image · ${counts.noImage}` },
          ]}
        />
      </div>

      {cards.length === 0 ? (
        <EmptyState
          title={emptyHint ?? "Nothing matches this filter."}
          description={emptyHint ? undefined : "Loosen the filter to see more of the library."}
        />
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(216px,1fr))]">
          {cards.map((card) => (
            <ModelCard
              key={card.slug}
              card={card}
              href={modelPath(card.slug)}
              onOpen={() => onOpen(card.slug)}
              meta={card.size}
              actions={
                canDelete ? (
                  <Button
                    shape="icon"
                    size="sm"
                    variant="secondary"
                    aria-label={
                      card.usageCount > 0
                        ? `Delete ${card.title} — remove its placements first`
                        : `Delete ${card.title}`
                    }
                    disabled={card.usageCount > 0}
                    title={card.usageCount > 0 ? "Remove its placements first" : undefined}
                    onClick={() => onDelete(card.slug)}
                  >
                    <Icon name="trash" size={14} />
                  </Button>
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
          title="Add models in bulk"
          description="Pick several ZIP archives at once — titles autofill from filenames."
          action={
            <Button variant="accent" shape="pill" size="sm" onClick={onUpload}>
              Upload models
            </Button>
          }
        />
      ) : null}
    </>
  );
}
