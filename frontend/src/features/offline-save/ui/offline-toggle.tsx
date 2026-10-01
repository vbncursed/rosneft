import { desktopBridge } from "@/shared/lib/desktop";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { offlineActions, useOfflineTerritory } from "../model/offline-store";
import { offlineView, type OfflineView } from "../model/offline-view";

const ICON = { idle: "download", saving: "close", saved: "check", failed: "refresh" } as const;
const ACTION: Record<OfflineView["kind"], string> = { idle: "Save offline", saving: "Cancel", saved: "Remove from device", failed: "Retry" };

export type OfflineControlProps = {
  view: OfflineView;
  title: string;
  onAct: () => void;
  compact?: boolean;
};

/** What the control looks like for one state — the part a fixture can draw without a shell. */
export function OfflineControl({ view, title, onAct, compact = false }: OfflineControlProps) {
  if (compact) {
    const name =
      view.kind === "idle" ? `Save ${title} offline` : view.kind === "saving" ? `Cancel saving ${title} — ${view.label}` : `${title} — ${view.label}`;
    return (
      <Button shape="icon" size="sm" variant="secondary" aria-label={name} tooltip={{ label: view.label }} disabled={view.kind === "saved"} onClick={onAct}>
        <Icon name={ICON[view.kind]} size={14} />
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span role="status" className="font-mono text-[10px] text-muted">
        {view.label}
      </span>
      <Button variant="secondary" size="sm" onClick={onAct}>
        <Icon name={ICON[view.kind]} size={14} className="mr-2" />
        {ACTION[view.kind]}
      </Button>
    </span>
  );
}

export type OfflineToggleProps = {
  slug: string;
  title: string;
  /** The catalog card's icon control: save, cancel or retry — removal lives on the viewer and the Storage section. */
  compact?: boolean;
};

/** Save a territory to this device, follow the download, remove it. Draws nothing outside the desktop shell. */
export function OfflineToggle({ slug, title, compact = false }: OfflineToggleProps) {
  const { saved, progress } = useOfflineTerritory(slug);
  if (!desktopBridge()) return null;
  const view = offlineView(saved, progress);
  const act = () => {
    if (view.kind === "saving") offlineActions.cancel(slug);
    else if (view.kind === "saved") void offlineActions.remove(slug);
    else offlineActions.save(slug);
  };
  return <OfflineControl view={view} title={title} onAct={act} compact={compact} />;
}
