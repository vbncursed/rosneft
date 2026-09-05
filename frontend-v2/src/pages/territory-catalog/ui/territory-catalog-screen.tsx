import { useNavigate } from "@tanstack/react-router";
import { territoryPath } from "@/entities/territory";
import { leaveTo } from "@/shared/lib/leave";
import { Callout } from "@/shared/ui/callout";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Skeleton } from "@/shared/ui/skeleton";
import { matchesTerritory, tabCounts } from "../model/catalog";
import { useTerritoryCatalog } from "../model/use-territory-catalog";
import { TerritoryCatalogPage } from "./territory-catalog-page";

/** Maps the container onto the page and draws the delete confirmation beside it. */
export function TerritoryCatalogScreen() {
  const s = useTerritoryCatalog();
  const navigate = useNavigate();

  if (s.status === "loading") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading territories"
        className="flex flex-col gap-3"
      >
        <Skeleton height="28px" width="30%" />
        <Skeleton height="96px" />
        <Skeleton height="96px" />
      </div>
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
        onOpen={(slug) => leaveTo(territoryPath(slug))}
        onReplace={(slug) => leaveTo(`/territories/${encodeURIComponent(slug)}/replace`)}
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
    </>
  );
}
