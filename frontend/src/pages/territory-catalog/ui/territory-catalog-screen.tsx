import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { territoryPath, type TerritoryCardModel } from "@/entities/territory";
import { EditDetailsDialog } from "@/features/edit-entity";
import { Callout } from "@/shared/ui/callout";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { PageSkeleton } from "@/shared/ui/skeleton";
import { matchesTerritory, tabCounts } from "../model/catalog";
import { useTerritoryCatalog } from "../model/use-territory-catalog";
import { TerritoryCatalogPage } from "./territory-catalog-page";

/** Maps the container onto the page and draws the delete confirmation beside it. */
export function TerritoryCatalogScreen() {
  const s = useTerritoryCatalog();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<TerritoryCardModel | null>(null);

  if (s.status === "loading") {
    return (
      <PageSkeleton shape="catalog" label="Loading territories" />
    );
  }
  if (s.status === "unavailable" || !s.cards) {
    return <Callout tone="bad">Territories are unavailable: {s.error}</Callout>;
  }

  // Filtered inline, not memoised: `s.cards` is rebuilt on every render of the
  // container, so a useMemo keyed on it would never hit (see ContentScreen).
  const filtered = s.cards.filter((c) => matchesTerritory(c, s.tab, s.query));

  return (
    <>
      <TerritoryCatalogPage
        cards={filtered}
        tab={s.tab}
        counts={tabCounts(s.cards)}
        onTabChange={s.setTab}
        query={s.query}
        onQueryChange={s.setQuery}
        canUpload={s.canUpload}
        canDelete={s.canDelete}
        canReplace={s.canReplace}
        onUpload={() => void navigate({ to: "/territories/new" })}
        onOpen={(slug) => void navigate({ href: territoryPath(slug) })}
        onReplace={(slug) => void navigate({ href: `/territories/${encodeURIComponent(slug)}/replace` })}
        onEdit={(slug) => setEditing(filtered.find((c) => c.slug === slug) ?? null)}
        onDelete={s.ask}
        {...(s.cards.length === 0
          ? { emptyHint: "No territories yet — upload one to get started." }
          : {})}
      />

      {s.pending ? (
        <ConfirmDialog
          open
          title={`Delete ${s.pending.title}?`}
          description="Its placements, panoramas and documents go with it. This cannot be undone."
          confirmLabel="Delete"
          tone="danger"
          busy={s.busy}
          onConfirm={s.confirm}
          onCancel={s.dismiss}
        />
      ) : null}
      {editing ? (
        <EditDetailsDialog
          kind="territory"
          slug={editing.slug}
          title={editing.title}
          description={editing.description}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
