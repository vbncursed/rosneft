import type { Placement, Vec3 } from "./placement";

export type PlacementInstance = { id: number; index: number; label: string; hidden: boolean; groupId: number | null };
export type ModelGroup = { model: { slug: string; title: string }; instances: PlacementInstance[] };

/** The panel's list: one row per model, its instances numbered by creation (id) order. */
export function groupByModel(placements: Placement[], options: { slug: string; title: string }[]): ModelGroup[] {
  const titles = new Map(options.map((o) => [o.slug, o.title]));
  const bySlug = new Map<string, Placement[]>();
  for (const p of placements) bySlug.set(p.modelSlug, [...(bySlug.get(p.modelSlug) ?? []), p]);
  return [...bySlug.entries()]
    .map(([slug, list]) => ({
      model: { slug, title: titles.get(slug) ?? slug },
      instances: [...list]
        .sort((a, b) => a.id - b.id)
        .map((p, i) => ({ id: p.id, index: i + 1, label: p.label, hidden: p.hidden, groupId: p.groupId })),
    }))
    .sort((a, b) => a.model.title.localeCompare(b.model.title));
}

export const instanceName = (group: ModelGroup, instance: PlacementInstance) =>
  `${group.model.title} #${instance.index}`;

export const instanceLine = (instance: PlacementInstance) =>
  instance.label ? `#${instance.index} · ${instance.label}` : `#${instance.index}`;

export function groupLine(group: ModelGroup, selectedId: number | null): string {
  const n = group.instances.length;
  const count = `${n} ${n === 1 ? "instance" : "instances"}`;
  const selected = group.instances.find((i) => i.id === selectedId);
  return selected ? `${count} · #${selected.index} selected` : count;
}

export function matchesObjects(group: ModelGroup, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    group.model.title.toLowerCase().includes(q) ||
    group.model.slug.toLowerCase().includes(q) ||
    group.instances.some((i) => i.label.toLowerCase().includes(q))
  );
}

export const DEFAULT_SCALE = 0.1;

/**
 * Both GLBs are normalised to max-axis 2, so scale 1 draws a model as big as
 * the territory. The source bboxes give the real ratio; without one, a small default.
 */
export function realWorldScale(option: { bboxMin?: Vec3; bboxMax?: Vec3 } | undefined, territoryMaxDim: number): number {
  if (territoryMaxDim <= 0 || !option?.bboxMin || !option.bboxMax) return DEFAULT_SCALE;
  const { bboxMin: a, bboxMax: b } = option;
  const modelMax = Math.max(b.x - a.x, b.y - a.y, b.z - a.z);
  return modelMax > 0 ? modelMax / territoryMaxDim : DEFAULT_SCALE;
}
