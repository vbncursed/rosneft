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

type Draft = { kind: "new" | "rename"; id: number; label: string; transform: PlacementTransform };

const transformOf = (p: ResolvedPlacement): PlacementTransform => ({
  position: p.position,
  rotation: p.rotation,
  scale: p.scale,
});

/**
 * The create/rename form under the object list.
 *
 * A "new" form is opened on a placement the server has *already* written — the
 * picker POSTs first so the object is in the scene while it is being named —
 * which is why cancelling one deletes it rather than merely closing. A rename
 * has nothing to undo, so cancelling one closes and no more.
 *
 * The draft lives here, not in `SelectedBlock`: the block is redrawn whenever
 * the scene reports a drag, and state inside it would be thrown away by the
 * refresh that a gizmo drag causes.
 */
export function usePlacementForm(editor: FormEditor, select: (id: number | null) => void) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [awaited, setAwaited] = useState<number | null>(null);
  const { placements, mutation, update, rename, remove } = editor;

  // The POST that created the object resolves a microtask before React has
  // committed the row, so `openNew` names an id the list does not hold yet and
  // the form waits for it here — adjusted during render, React's own
  // alternative to an effect, so the object and its form land in one commit.
  if (awaited !== null) {
    const arrived = placements.find((p) => p.id === awaited);
    if (arrived) {
      setAwaited(null);
      setDraft({ kind: "new", id: arrived.id, label: "", transform: transformOf(arrived) });
    }
  }

  const openNew = useCallback(
    (id: number) => {
      setAwaited(id);
      select(id);
    },
    [select],
  );

  const openRename = useCallback(
    (id: number) => {
      const placement = placements.find((p) => p.id === id);
      if (!placement) return;
      // A create form starts blank; a rename starts on what the object is
      // called now, because that is the string being corrected.
      setDraft({ kind: "rename", id, label: placement.label, transform: transformOf(placement) });
      select(id);
    },
    [placements, select],
  );

  const close = useCallback(() => {
    setAwaited(null);
    setDraft(null);
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    if (draft.kind === "rename") await rename(draft.id, draft.label);
    else await update(draft.id, { ...draft.transform, label: draft.label });
    setDraft(null);
  }, [draft, rename, update]);

  const cancel = useCallback(async () => {
    if (!draft) return;
    setDraft(null);
    if (draft.kind !== "new") return;
    select(null);
    await remove(draft.id);
  }, [draft, remove, select]);

  const form: PlacementFormView | null = draft && {
    kind: draft.kind,
    label: draft.label,
    onLabel: (label) => setDraft((d) => d && { ...d, label }),
    transform: draft.transform,
    onTransform: (transform) => setDraft((d) => d && { ...d, transform }),
    saving: isMutatingId(mutation, draft.id),
    onSave: () => void save(),
    onCancel: () => void cancel(),
  };

  return { form, openNew, openRename, close };
}
