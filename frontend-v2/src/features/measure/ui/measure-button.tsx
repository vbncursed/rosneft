import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";

export type MeasureButtonProps = {
  active: boolean;
  onToggle: () => void;
};

/** Turns the measure tool on and off. `M` does the same thing. */
export function MeasureButton({ active, onToggle }: MeasureButtonProps) {
  return (
    <Button
      variant={active ? "accent" : "secondary"}
      onClick={onToggle}
      aria-pressed={active}
      title="Measure (M)"
    >
      <Icon name="ruler" size={15} />
      {active ? "Measuring" : "Measure"}
    </Button>
  );
}
