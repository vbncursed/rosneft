import { useMemo } from "react";
import type { Panorama } from "@/panorama/domain/panorama";
import Dropdown from "@/shared/presentation/components/dropdown/dropdown";
import type { DropdownOption } from "@/shared/presentation/components/dropdown/dropdown-option";

interface PanoramaPickerProps {
  panoramas: Panorama[];
  activeId: number | null;
  onActivate: (id: number | null) => void;
}

// "" reserves the null-id slot for the "3D scene" choice; Dropdown
// works on strings, so we marshal id ↔ string at this boundary only.
const SCENE_VALUE = "";

// PanoramaPicker is the dropdown-style switcher between 3D view ("none")
// and each available panorama. Lives in the placements panel header so
// the user can flip modes without losing their selected placement.
export default function PanoramaPicker({
  panoramas,
  activeId,
  onActivate,
}: PanoramaPickerProps) {
  const options = useMemo<DropdownOption[]>(
    () => [
      { value: SCENE_VALUE, label: "3D scene" },
      ...panoramas.map((p) => ({ value: String(p.id), label: p.title })),
    ],
    [panoramas],
  );

  if (panoramas.length === 0) return null;

  return (
    <Dropdown
      label="View"
      ariaLabel="Active view"
      value={activeId == null ? SCENE_VALUE : String(activeId)}
      options={options}
      onChange={(value) =>
        onActivate(value === SCENE_VALUE ? null : Number(value))
      }
      className="min-w-[180px]"
    />
  );
}
