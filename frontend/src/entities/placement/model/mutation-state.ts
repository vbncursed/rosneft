/**
 * The editor's in-flight mutation as a discriminated union, replacing a magic
 * `pendingId === -1` sentinel. The states are mutually exclusive: at most one
 * create or one mutation runs at a time.
 */
export type MutationState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "mutating"; id: number };

export const idle: MutationState = { kind: "idle" };
export const creating: MutationState = { kind: "creating" };

export const mutating = (id: number): MutationState => ({ kind: "mutating", id });

export const isCreating = (state: MutationState): boolean => state.kind === "creating";

export const isMutatingId = (state: MutationState, id: number): boolean =>
  state.kind === "mutating" && state.id === id;

/**
 * The placement whose row controls wait for a single write. Bulk writes keep
 * their own pending ids (`useBulkWrites`); the editor joins the two.
 */
export const pendingIdsOf = (state: MutationState): number[] => (state.kind === "mutating" ? [state.id] : []);
