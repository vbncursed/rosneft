import { useCallback, useState } from "react";
import {
  isMutatingId,
  type MutationState,
  type PlacementTransform,
  type ResolvedPlacement,
} from "@/entities/placement";
import type { SelectedBlockProps } from "@/widgets/placements-panel";

/** The slice of `usePlacementsEditor` this form drives. */
export type FormEditor = {
  placements: ResolvedPlacement[];
  mutation: MutationState;
  update: (id: number, body: PlacementTransform & { label: string }) => Promise<void>;
  rename: (id: number, label: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
};

/** Exactly what `SelectedBlock` draws; reused rather than re-declared. */
export type PlacementFormView = NonNullable<SelectedBlockProps["form"]>;

type Draft = {
  kind: "new" | "edit";
  id: number;
  label: string;
  transform: PlacementTransform;
  /** The reader typed into a number cell, so the draft's copy is theirs to keep. */
  touched: boolean;
};

const transformOf = (p: ResolvedPlacement): PlacementTransform => ({
  position: p.position,
  rotation: p.rotation,
  scale: p.scale,
});

const editDraft = (p: ResolvedPlacement): Draft => ({
  kind: "edit",
  id: p.id,
  label: p.label,
  transform: transformOf(p),
  touched: false,
});

/**
 * The form under the object list — which is the whole block, not an occasional
 * visitor: anything selected that the reader may write is a live draft, so the
 * label, the cells and Save are on screen the moment something is picked.
 *
 * A "new" draft is opened on a placement the server has *already* written —
 * the picker POSTs first so the object is in the scene while it is being
 * named — which is why cancelling one deletes it. An "edit" draft has nothing
 * to undo, so cancelling one resets the fields and no more.
 *
 * `selectedId` is the page's selection, and null for a reader without
 * `placement:write` — that is the one state with no form at all. Every draft
 * is keyed on it: selecting elsewhere re-seeds the block, deselecting empties
 * it, and a "new" draft the reader has clicked away from is simply gone.
 *
 * The draft lives here, not in `SelectedBlock`: the block is redrawn whenever
 * the scene reports a drag, and state inside it would be thrown away by the
 * refresh that a gizmo drag causes.
 */
export function usePlacementForm(
  editor: FormEditor,
  select: (id: number | null) => void,
  selectedId: number | null,
) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [awaited, setAwaited] = useState<number | null>(null);
  const { placements, mutation, update, rename, remove } = editor;

  // Both branches adjust state during render — React's own alternative to an
  // effect, so the object and its form land in one commit. The POST that
  // created an object resolves a microtask before React has committed the row,
  // so `openNew` names an id the list does not hold yet and the form waits for
  // it here; anything else, the block follows the selection.
  if (awaited !== null) {
    const arrived = placements.find((p) => p.id === awaited);
    if (arrived) {
      setAwaited(null);
      setDraft({ kind: "new", id: arrived.id, label: "", transform: transformOf(arrived), touched: false });
    }
  } else if ((draft?.id ?? null) !== selectedId) {
    const picked = placements.find((p) => p.id === selectedId);
    setDraft(picked ? editDraft(picked) : null);
  }

  const openNew = useCallback(
    (id: number) => {
      setAwaited(id);
      select(id);
    },
    [select],
  );

  // Rename is now only a way *in* — the draft it seeds is the same one the
  // selection would have produced, with the label field worth looking at.
  const openRename = useCallback(
    (id: number) => {
      const placement = placements.find((p) => p.id === id);
      if (!placement) return;
      setDraft(editDraft(placement));
      select(id);
    },
    [placements, select],
  );

  // An untouched transform is not this form's to send. The gizmo stays live
  // under the form and a drag commits its own PUT, so the copy taken when the
  // draft was seeded is stale the moment the reader positions the object.
  // `rename` reads the editor's own list, i.e. the last committed transform,
  // and sends that back with the label. The draft's numbers go out only when
  // someone typed them. Saving re-seeds rather than closes: the block is a
  // form for as long as something is selected.
  const save = useCallback(async () => {
    if (!draft) return;
    if (draft.touched) await update(draft.id, { ...draft.transform, label: draft.label });
    else await rename(draft.id, draft.label);
    setDraft((d) => d && { ...d, kind: "edit", touched: false });
  }, [draft, rename, update]);

  const cancel = useCallback(async () => {
    if (!draft) return;
    if (draft.kind === "new") {
      setDraft(null);
      select(null);
      await remove(draft.id);
      return;
    }
    const live = placements.find((p) => p.id === draft.id);
    if (live) setDraft(editDraft(live));
  }, [draft, placements, remove, select]);

  const live = draft && placements.find((p) => p.id === draft.id);
  const form: PlacementFormView | null = draft && {
    kind: draft.kind,
    label: draft.label,
    onLabel: (label) => setDraft((d) => d && { ...d, label }),
    transform: draft.touched || !live ? draft.transform : transformOf(live),
    onTransform: (transform) => setDraft((d) => d && { ...d, transform, touched: true }),
    saving: isMutatingId(mutation, draft.id),
    onSave: () => void save(),
    onCancel: () => void cancel(),
  };

  return { form, openNew, openRename };
}
