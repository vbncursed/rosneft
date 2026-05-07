import { useState } from "react";
import type { Vec3 } from "@/shared/domain/vec3";
import type {
  PlacementUpdate,
  ResolvedPlacement,
} from "@/placement/domain/placement";
import { degToRad, radToDeg, roundAxis } from "@/placement/domain/transform";
import Vec3Field from "@/placement/presentation/components/vec3-field";

interface PlacementFormProps {
  placement: ResolvedPlacement;
  pending: boolean;
  onSave: (body: PlacementUpdate) => Promise<void> | void;
}

function roundedVec(v: Vec3): Vec3 {
  return { x: roundAxis(v.x), y: roundAxis(v.y), z: roundAxis(v.z) };
}

function rotationToDegrees(v: Vec3): Vec3 {
  return {
    x: roundAxis(radToDeg(v.x)),
    y: roundAxis(radToDeg(v.y)),
    z: roundAxis(radToDeg(v.z)),
  };
}

function rotationToRadians(v: Vec3): Vec3 {
  return { x: degToRad(v.x), y: degToRad(v.y), z: degToRad(v.z) };
}

export default function PlacementForm({
  placement,
  pending,
  onSave,
}: PlacementFormProps) {
  const [pos, setPos] = useState<Vec3>(roundedVec(placement.position));
  const [rotDeg, setRotDeg] = useState<Vec3>(rotationToDegrees(placement.rotation));
  const [scale, setScale] = useState<Vec3>(roundedVec(placement.scale));
  const [label, setLabel] = useState(placement.label);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({
      position: pos,
      rotation: rotationToRadians(rotDeg),
      scale,
      label,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
    >
      <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
        Transform · #{placement.id}
      </p>

      <Vec3Field label="Position" value={pos} onChange={setPos} step={0.05} />
      <Vec3Field label="Rotation (deg)" value={rotDeg} onChange={setRotDeg} step={5} />
      <Vec3Field label="Scale" value={scale} onChange={setScale} step={0.05} min={0.001} />

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
          Label
        </span>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={120}
          className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm outline-none transition-colors focus:border-white/40"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
