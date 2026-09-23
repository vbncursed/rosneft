import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { EditDetailsDialog } from "@/features/edit-entity";
import { Callout } from "@/shared/ui/callout";
import { EmptyState } from "@/shared/ui/card";
import { ViewerSkeleton } from "@/widgets/viewer-skeleton";
import { useSceneSeeded } from "../model/use-scene-seeded";
import { useTerritoryViewer } from "../model/use-territory-viewer";
import { TerritoryViewerPage } from "./territory-viewer-page";

const CENTRED = "flex min-h-0 flex-1 items-center justify-center bg-panel p-3.5";

/** Mock state 16: the header is not drawn yet, so the card carries the whole screen. */
export function ViewerLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the viewer" className={CENTRED}>
      <ViewerSkeleton />
    </div>
  );
}

/** Maps the container onto the page — loading, not-found, unavailable, or the viewer. */
function ViewerBody({ slug }: { slug: string }) {
  const state = useTerritoryViewer(slug);
  const [editing, setEditing] = useState(false);

  if (state.status === "loading") return <ViewerLoading />;

  if (state.status === "missing") {
    return (
      <div className={CENTRED}>
        <EmptyState
          title="Territory not found"
          action={
            <a
              href="/territories"
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted no-underline hover:text-fg"
            >
              ← Territory catalog
            </a>
          }
        />
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div className={CENTRED}>
        <Callout tone="bad">Territory unavailable: {state.error}</Callout>
      </div>
    );
  }

  return (
    <>
      <TerritoryViewerPage {...state} header={{ ...state.header, onEdit: () => setEditing(true) }} />
      {editing ? (
        <EditDetailsDialog
          kind="territory"
          slug={slug}
          title={state.header.title}
          description={state.header.description}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}

/**
 * The route component.
 *
 * The body is keyed twice over. On `slug`, because the router keeps one
 * instance across a `$slug` change and every hook below belongs to one
 * territory. And on whether the bundle is in hand, because
 * `usePlacementsEditor` seeds its list at mount and a body mounted before the
 * fetch answered would seed an empty one and never adopt the real list. That
 * second key flips exactly once, while the loading card is on screen, so
 * nothing a reader has done is thrown away by it — and it deliberately does
 * *not* track the placements, which would remount the editor mid-create and
 * take the form that `onPlace` opens with it.
 */
export function TerritoryViewerScreen() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const seeded = useSceneSeeded(slug);
  return <ViewerBody key={`${slug}:${seeded}`} slug={slug} />;
}
