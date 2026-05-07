// MutationState models the editor's in-flight mutation as a discriminated
// union, replacing the magic `pendingId === -1` sentinel. The states are
// mutually exclusive: at most one create or one mutation runs at a time.
export type MutationState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "mutating"; id: number };

export const idle: MutationState = { kind: "idle" };
export const creating: MutationState = { kind: "creating" };

export function mutating(id: number): MutationState {
  return { kind: "mutating", id };
}

export function isCreating(state: MutationState): boolean {
  return state.kind === "creating";
}

export function isMutatingId(state: MutationState, id: number): boolean {
  return state.kind === "mutating" && state.id === id;
}
