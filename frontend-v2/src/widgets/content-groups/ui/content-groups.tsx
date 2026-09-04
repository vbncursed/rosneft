import type { ReactNode } from "react";
import { ContentRow, type ContentItem } from "@/entities/content";
import { EmptyState } from "@/shared/ui/card";
import { Icon } from "@/shared/ui/icon";
import { SectionHeading } from "@/shared/ui/section-heading";

export type ContentGroup = {
  key: string;
  label: string;
  /** Free text beside the heading, e.g. "12 items · 11 ready". */
  note?: string;
  items: ContentItem[];
};

export type ContentGroupsProps = {
  groups: ContentGroup[];
  selectedSlug?: string | null;
  onSelect?: (item: ContentItem) => void;
  /** Row menu, built per item by the page. */
  renderActions?: (item: ContentItem) => ReactNode;
  /** The drop target under the list; absent for a reader who may not upload. */
  onDropZoneClick?: () => void;
  dropHint?: string;
  /** Replaces the filter-miss wording, and its "loosen the filter" advice with it. */
  emptyHint?: string;
};

// It is a button, not a drop target: nothing here handles a dropped file, and
// the conversion starts when the form it opens is submitted.
const DROP_HINT = "Upload an OBJ or GLB — opens the upload form";
const FILTER_MISS = {
  title: "Nothing matches this filter.",
  description: "Loosen the filter to see more of the catalog.",
};

export function ContentGroups({
  groups,
  selectedSlug = null,
  onSelect,
  renderActions,
  onDropZoneClick,
  dropHint = DROP_HINT,
  emptyHint,
}: ContentGroupsProps) {
  const populated = groups.filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {populated.length === 0 ? (
        <EmptyState {...(emptyHint ? { title: emptyHint } : FILTER_MISS)} />
      ) : (
        populated.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <SectionHeading title={group.label} count={group.note} className="pb-3 pt-0.5" />
            <div className="flex flex-col gap-2.5">
              {group.items.map((item) => (
                <ContentRow
                  key={`${item.kind}:${item.slug}`}
                  item={item}
                  selected={item.slug === selectedSlug}
                  onSelect={onSelect ? () => onSelect(item) : undefined}
                  actions={renderActions?.(item)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {onDropZoneClick ? (
        <button
          type="button"
          onClick={onDropZoneClick}
          className="flex cursor-pointer items-center gap-2.5 rounded-card border border-dashed border-line-2 bg-transparent p-4.5 text-left text-[13px] text-muted transition-colors duration-150 hover:border-accent-line hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Icon name="upload" size={16} />
          {dropHint}
        </button>
      ) : null}
    </div>
  );
}
