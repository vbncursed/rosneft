import { useNavigate } from "@tanstack/react-router";
import { Callout } from "@/shared/ui/callout";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Skeleton } from "@/shared/ui/skeleton";
import { matchesModel, tabCounts } from "../model/catalog";
import { useModelLibrary } from "../model/use-model-library";
import { ModelLibraryPage } from "./model-library-page";

/** Maps the container onto the page and draws the delete confirmation beside it. */
export function ModelLibraryScreen() {
  const s = useModelLibrary();
  const navigate = useNavigate();

  if (s.status === "loading") {
    return (
      <div role="status" aria-busy="true" aria-label="Loading models" className="flex flex-col gap-3">
        <Skeleton height="28px" width="30%" />
        <Skeleton height="96px" />
        <Skeleton height="96px" />
      </div>
    );
  }
  if (s.status === "unavailable" || !s.cards) {
    return <Callout tone="bad">Models are unavailable: {s.error}</Callout>;
  }

  // Filtered inline, not memoised: `s.cards` is rebuilt on every render of the
  // container, so a useMemo keyed on it would never hit (see ContentScreen).
  const filtered = s.cards.filter((c) => matchesModel(c, s.tab, s.query));

  return (
    <>
      <ModelLibraryPage
        cards={filtered}
        tab={s.tab}
        counts={tabCounts(s.cards)}
        onTabChange={s.setTab}
        query={s.query}
        onQueryChange={s.setQuery}
        canUpload={s.canUpload}
        canDelete={s.canDelete}
        onUpload={() => void navigate({ to: "/models/new" })}
        onOpen={(slug) => void navigate({ href: `/models/${encodeURIComponent(slug)}` })}
        onDelete={s.ask}
        {...(s.cards.length === 0
          ? { emptyHint: "No models yet — upload one to get started." }
          : {})}
      />

      {s.pending ? (
        <ConfirmDialog
          open
          title={`Delete ${s.pending.title}?`}
          description="This cannot be undone."
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
