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
  /** Reopening even the same placement starts a distinct form session. */
  session: symbol;
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
  session: Symbol(),
  kind: "edit",
  id: p.id,
  label: p.label,
  transform: transformOf(p),
  touched: false,
});

type FormState = {
  selectedId: number | null;
  draft: Draft | null;
  awaiting: boolean;
};
type ChangeDraft = (change: (draft: Draft | null) => Draft | null) => void;

/** An edit follows selection, but retains its fields while that row is missing. */
function reconcileEdit(state: FormState, picked: ResolvedPlacement | undefined): FormState {
  if (state.draft && state.draft.id === state.selectedId) return state;
  const draft = picked ? editDraft(picked) : null;
  if (draft === state.draft) return state;
  return { ...state, draft };
}

/** Selection changes discard pending creates; otherwise arrival takes priority. */
function reconcileSelection(state: FormState, selectedId: number | null, placements: ResolvedPlacement[]): FormState {
  const picked = placements.find((p) => p.id === selectedId);
  if (state.selectedId !== selectedId) {
    return reconcileEdit({ ...state, selectedId, awaiting: false }, picked);
  }
  if (!state.awaiting) return reconcileEdit(state, picked);
  if (!picked) return state;
  return { selectedId, draft: { ...editDraft(picked), kind: "new", label: "" }, awaiting: false };
}

function usePlacementDraft(
  placements: ResolvedPlacement[],
  select: (id: number | null) => void,
  selectedId: number | null,
) {
  const [state, setState] = useState<FormState>({ selectedId: null, draft: null, awaiting: false });
  const next = reconcileSelection(state, selectedId, placements);
  if (next !== state) setState(next);
  const changeDraft: ChangeDraft = useCallback((change) => {
    setState((current) => ({ ...current, draft: change(current.draft) }));
  }, []);
  const openNew = useCallback(
    (id: number) => {
      setState({ selectedId: id, draft: null, awaiting: true });
      select(id);
    },
    [select],
  );
  const openRename = useCallback(
    (id: number) => {
      const placement = placements.find((p) => p.id === id);
      if (!placement) return;
      setState((current) => ({
        selectedId: id,
        awaiting: current.awaiting && current.selectedId === id,
        draft: current.draft?.id === id && current.draft.kind === "new" ? current.draft : editDraft(placement),
      }));
      select(id);
    },
    [placements, select],
  );
  return { draft: state.draft, changeDraft, openNew, openRename };
}

/** Untyped numbers belong to the live gizmo; only typed transforms are sent. */
async function saveDraft(draft: Draft, editor: FormEditor, changeDraft: ChangeDraft) {
  if (draft.touched) await editor.update(draft.id, { ...draft.transform, label: draft.label });
  else await editor.rename(draft.id, draft.label);
  changeDraft((current) => {
    if (current?.session !== draft.session) return current;
    return { ...current, kind: "edit", touched: current.touched && current.transform !== draft.transform };
  });
}

/** New objects already exist on the server; edits only reset local fields. */
async function cancelDraft(
  draft: Draft,
  editor: FormEditor,
  changeDraft: ChangeDraft,
  select: (id: number | null) => void,
) {
  if (draft.kind === "new") {
    changeDraft(() => null);
    select(null);
    await editor.remove(draft.id);
    return;
  }
  const live = editor.placements.find((p) => p.id === draft.id);
  if (live) changeDraft(() => editDraft(live));
}

function placementForm(
  draft: Draft | null,
  editor: FormEditor,
  changeDraft: ChangeDraft,
  select: (id: number | null) => void,
): PlacementFormView | null {
  if (!draft) return null;
  const live = editor.placements.find((p) => p.id === draft.id);
  return {
    kind: draft.kind,
    label: draft.label,
    onLabel: (label) => changeDraft((current) => current && { ...current, label }),
    transform: draft.touched || !live ? draft.transform : transformOf(live),
    onTransform: (transform) => changeDraft((current) => current && { ...current, transform, touched: true }),
    saving: isMutatingId(editor.mutation, draft.id),
    onSave: () => void saveDraft(draft, editor, changeDraft),
    onCancel: () => void cancelDraft(draft, editor, changeDraft, select),
  };
}

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
export function usePlacementForm(editor: FormEditor, select: (id: number | null) => void, selectedId: number | null) {
  const { draft, changeDraft, openNew, openRename } = usePlacementDraft(editor.placements, select, selectedId);
  return { form: placementForm(draft, editor, changeDraft, select), openNew, openRename };
}
