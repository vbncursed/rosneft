import { instanceName, type ModelGroup, type Vec3 } from "@/entities/placement";
import { memoLast } from "./memo-last";

/** The viewport markers' names, by placement id — the panel's numbering, exactly. */
export const markerLabels = (groups: ModelGroup[]): Record<number, string> =>
  Object.fromEntries(
    groups.flatMap((group) =>
      group.instances.map((instance) => [instance.id, instanceName(group, instance)]),
    ),
  );

// Memoised: pageProps runs on every page render, and a fresh object in these two
// canvas props re-rendered the 3D scene on every fold (`memo-last.ts`).
export const labelsOf = memoLast(markerLabels);
export const moveOf = memoLast(
  (active: boolean, draggingId: number | null, livePos: Vec3 | null) => ({
    active,
    draggingId,
    livePos,
  }),
);
