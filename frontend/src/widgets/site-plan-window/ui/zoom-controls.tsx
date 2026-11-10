import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";

export function ZoomControls({ zoom, fit }: { zoom: (factor: number) => void; fit: () => void }) {
  return (
    <div className="absolute bottom-3 left-3 flex gap-1.5">
      <Button shape="icon" size="sm" variant="secondary" aria-label="Zoom in" onClick={() => zoom(1.25)}>
        <Icon name="plus" size={12} />
      </Button>
      <Button shape="icon" size="sm" variant="secondary" aria-label="Zoom out" onClick={() => zoom(1 / 1.25)}>
        <Icon name="minus" size={12} />
      </Button>
      <Button shape="icon" size="sm" variant="secondary" aria-label="Fit the page" onClick={fit}>
        <Icon name="maximize" size={12} />
      </Button>
    </div>
  );
}
