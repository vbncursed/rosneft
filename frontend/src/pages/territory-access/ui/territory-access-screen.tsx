import { AddPersonDialog } from "@/features/grant-access";
import { Callout } from "@/shared/ui/callout";
import { PageSkeleton } from "@/shared/ui/skeleton";
import { groupAccess, matchesAccess, mixOf, statsOf } from "../model/access-view";
import { useTerritoryAccess } from "../model/use-territory-access";
import { TerritoryAccessPage } from "./territory-access-page";

/** Maps the container onto the page and draws the person picker beside it. */
export function TerritoryAccessScreen() {
  const s = useTerritoryAccess();

  if (s.status === "loading") {
    return (
      <PageSkeleton shape="console" label="Loading territories" />
    );
  }
  if (s.status === "unavailable" || !s.territories) {
    return <Callout tone="bad">Territory access is unavailable: {s.error}</Callout>;
  }

  const selected = s.selected;
  // Grouped inline, not memoised: `grantsOf` is a fresh closure on every
  // render of the container, so a useMemo keyed on it would never hit.
  const groups = groupAccess(
    s.territories.filter((t) => matchesAccess(t, s.grantsOf(t.slug), s.query)),
  );

  return (
    <>
      <TerritoryAccessPage
        groups={groups}
        mix={mixOf(s.territories)}
        stats={statsOf(s.territories, s.adminsBySlug)}
        query={s.query}
        onQueryChange={s.setQuery}
        selectedSlug={selected?.slug ?? null}
        onManage={(t) => s.select(t.slug)}
        onCloseInspector={() => s.select(null)}
        managed={
          selected && {
            territory: selected,
            visibility: s.draft.length > 0 ? "assigned" : "private",
            grants: s.draft,
            dirty: s.dirty,
            saving: s.saving,
          }
        }
        onAddPerson={() => s.setAdding(true)}
        onRemoveGrant={s.remove}
        onCancel={s.cancel}
        onSave={s.save}
        canManage={s.canManage}
        {...(s.territories.length === 0
          ? { emptyHint: "No territories yet — upload one to start." }
          : {})}
      />

      {s.adding && selected ? (
        <AddPersonDialog
          open
          options={s.candidates}
          busy={s.saving}
          onClose={() => s.setAdding(false)}
          onAdd={s.add}
        />
      ) : null}
    </>
  );
}
