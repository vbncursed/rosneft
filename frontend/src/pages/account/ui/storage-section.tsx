import { useState } from "react";
import type { SavedTerritory, StorageUsage } from "@/shared/lib/desktop";
import { formatBytes } from "@/shared/lib/format-bytes";
import { longDate } from "@/shared/lib/short-date";
import { Button } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import { Card } from "@/shared/ui/card";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { ProgressBar } from "@/shared/ui/progress-bar";
import { SectionHeading } from "@/shared/ui/section-heading";
import { Segmented } from "@/shared/ui/segmented";

const GIB = 1024 ** 3;
const LIMITS = [5, 10, 20, 50].map((g) => ({ value: String(g), label: `${g} GB` }));

export type StorageSectionProps = {
  /** null with `usageFailed` false is "the shell has not answered yet". */
  usage: StorageUsage | null;
  /** The shell refused to report usage — distinct from still asking. */
  usageFailed: boolean;
  /** False until the saved list has been read once; an empty list before that is not "nothing saved". */
  savedLoaded: boolean;
  saved: SavedTerritory[];
  onLimit: (bytes: number) => Promise<void>;
  onClear: () => Promise<void>;
  onRemove: (slug: string) => Promise<void>;
};

function UsageReadout({ usage, failed }: { usage: StorageUsage | null; failed: boolean }) {
  if (usage) {
    return (
      <>
        <ProgressBar
          value={Math.round((usage.used / usage.limit) * 100)}
          tone={usage.pinned > usage.limit ? "warn" : "accent"}
          label={`${formatBytes(usage.used)} of ${formatBytes(usage.limit)} used`}
          ariaLabel="Storage used"
        />
        {usage.pinned > usage.limit ? (
          <Callout tone="warn">Saved territories exceed the limit — remove one or raise the limit.</Callout>
        ) : null}
      </>
    );
  }
  return failed ? (
    <Callout tone="warn">Storage usage unavailable</Callout>
  ) : (
    <p role="status" className="m-0 text-[13px] text-muted">Reading storage…</p>
  );
}

/** This device's offline copy: how much it takes, what is saved, the limit. Desktop shell only. */
export function StorageSection({ usage, usageFailed, savedLoaded, saved, onLimit, onClear, onRemove }: StorageSectionProps) {
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  const clear = async () => {
    setClearing(true);
    try {
      await onClear();
    } finally {
      setClearing(false);
      setConfirming(false);
    }
  };

  return (
    <Card padded={false} className="flex flex-col gap-4 p-[22px]">
      <SectionHeading title="Storage on this device" count="models and documents are kept so they open offline" />
      <UsageReadout usage={usage} failed={usageFailed} />

      <Segmented
        ariaLabel="Storage limit"
        items={LIMITS}
        value={usage ? String(Math.round(usage.limit / GIB)) : ""}
        onChange={(g) => void onLimit(Number(g) * GIB)}
      />

      {!savedLoaded ? (
        <p role="status" className="m-0 text-[13px] text-muted">Reading saved territories…</p>
      ) : saved.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">Nothing saved on this device yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          {saved.map((t) => (
            <li key={t.slug} className="flex items-center justify-between gap-4 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-fg">{t.title}</span>
                <span className="font-mono text-[10px] text-dim">
                  {formatBytes(t.bytes)} · saved {longDate(t.savedAt)} · synced {longDate(t.syncedAt)}
                </span>
              </span>
              <Button size="sm" aria-label={`Remove ${t.title} from this device`} onClick={() => void onRemove(t.slug)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button onClick={() => setConfirming(true)}>Clear cache</Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Clear the cache?"
        description="Models and documents you only opened are removed. Territories you saved stay."
        confirmLabel="Clear"
        busy={clearing}
        onConfirm={() => void clear()}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}
