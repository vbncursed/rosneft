/**
 * A `grpc_service` is a fully-qualified name (`rosneft.mesh.v1.MeshService`)
 * and a scrape name is short (`mesh-worker`, `mesh`), so pairing them is
 * containment either way round, case-insensitively. A convention, not a
 * guarantee: an unrelated pair sharing a substring would match. The health
 * list and the panel focus share it so a service selected in one is the
 * service paired in the other.
 */
export function matchesService(label: string, name: string): boolean {
  const a = label.toLowerCase();
  const b = name.toLowerCase();
  return a.includes(b) || b.includes(a);
}
