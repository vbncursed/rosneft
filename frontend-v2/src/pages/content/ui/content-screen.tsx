import { contentPath, type ContentItem } from "@/entities/content";
import { leaveTo } from "@/shared/lib/leave";
import { Callout } from "@/shared/ui/callout";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Menu } from "@/shared/ui/menu";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  conversionNoteOf,
  groupContent,
  inspectorDetails,
  matchesContent,
  pipelineOf,
  replaceHref,
  statsOf,
  uploadHref,
} from "../model/catalog";
import { useContent } from "../model/use-content";
import { ContentPage } from "./content-page";

const DESCRIPTION = {
  territory:
    "The territory, its placements, panoramas and documents are removed. Converted artifacts stay until nothing references them.",
  model:
    "The model is removed from the library. The gateway refuses while any territory still places it.",
} as const;

/** Maps the container onto the page and draws the confirm dialog beside it. */
export function ContentScreen() {
  const s = useContent();

  if (s.status === "loading") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading content"
        className="flex flex-col gap-3"
      >
        <Skeleton height="28px" width="30%" />
        <Skeleton height="96px" />
        <Skeleton height="96px" />
      </div>
    );
  }
  if (s.status === "unavailable" || !s.items) {
    return <Callout tone="bad">Content is unavailable: {s.error}</Callout>;
  }

  const selected = s.selected;
  const replace = selected ? replaceHref(selected) : null;
  const job = selected ? s.jobOf(selected.kind, selected.slug) : undefined;
  // Grouped inline, not memoised: `s.items` is rebuilt on every render of the
  // container, so a useMemo keyed on it would never hit.
  const groups = groupContent(s.items.filter((i) => matchesContent(i, s.query)));

  // The row menu mirrors the inspector's actions for that row, so reaching one
  // never depends on having selected the row first. Delete stays out: it is
  // the one action that cannot be undone, and it keeps its confirmation.
  const rowActions = (item: ContentItem) => {
    const href = replaceHref(item);
    return (
      <Menu
        triggerLabel="Row actions"
        trigger={<Icon name="kebab" size={15} />}
        items={[
          { label: "Open in viewer", onSelect: () => leaveTo(contentPath(item)) },
          ...(href ? [{ label: "Replace source", onSelect: () => leaveTo(href) }] : []),
        ]}
      />
    );
  };

  return (
    <>
      <ContentPage
        groups={groups}
        pipeline={pipelineOf(s.items)}
        stats={statsOf(s.items, s.storageBytes)}
        query={s.query}
        onQueryChange={s.setQuery}
        selectedSlug={selected?.slug ?? null}
        onSelect={(item) => s.select(item.kind, item.slug)}
        onCloseInspector={s.deselect}
        inspected={
          selected && {
            item: selected,
            details: inspectorDetails(
              selected,
              s.artifactsOf(selected.kind, selected.slug),
              s.updatedAtOf(selected.kind, selected.slug),
              job,
            ),
            conversionNote: job ? conversionNoteOf(job) : undefined,
          }
        }
        canManage={s.canManage}
        {...(s.canManage ? { renderRowActions: rowActions } : {})}
        onUploadTerritory={() => leaveTo(uploadHref("territory"))}
        onUploadModel={() => leaveTo(uploadHref("model"))}
        onReplaceSource={replace ? () => leaveTo(replace) : undefined}
        onOpenInViewer={() => selected && leaveTo(contentPath(selected))}
        // Artifacts, not status: a re-conversion that is running or failed
        // leaves the previously converted scene on disk and viewable.
        openable={!!selected && s.artifactsOf(selected.kind, selected.slug).length > 0}
        onDelete={selected && s.canDelete(selected.kind) ? s.ask : undefined}
        {...(s.items.length === 0
          ? { emptyHint: "Nothing uploaded yet — start with a territory." }
          : {})}
      />

      {s.pending ? (
        <ConfirmDialog
          open
          title={`Delete ${s.pending.title}?`}
          description={DESCRIPTION[s.pending.kind]}
          confirmLabel="Delete"
          tone="danger"
          busy={s.busy}
          onConfirm={s.confirm}
          onCancel={s.dismiss}
        />
      ) : null}
    </>
  );
}
