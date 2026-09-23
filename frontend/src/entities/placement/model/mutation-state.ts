/**
 * The editor's in-flight mutation as a discriminated union, replacing a magic
 * `pendingId === -1` sentinel. The states are mutually exclusive: at most one
 * create or one mutation runs at a time.
 */
export type MutationState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "mutating"; id: number }
  /** A write over many placements at once — hide, show, move to a group. */
  | { kind: "bulk"; ids: number[] };

export const idle: MutationState = { kind: "idle" };
export const creating: MutationState = { kind: "creating" };

export const mutating = (id: number): MutationState => ({ kind: "mutating", id });

export const isCreating = (state: MutationState): boolean => state.kind === "creating";

export const isMutatingId = (state: MutationState, id: number): boolean =>
  state.kind === "mutating" && state.id === id;

export const bulk = (ids: number[]): MutationState => ({ kind: "bulk", ids });

/** Every placement whose row controls wait: one for a single write, each of them for a bulk one. */
export const pendingIdsOf = (state: MutationState): number[] =>
  state.kind === "mutating" ? [state.id] : state.kind === "bulk" ? state.ids : [];
