import type { ReactNode } from "react";

export type KeycapHintProps = { keyLabel: string; children: ReactNode };

/** `M measure` — a key and what it does, in the viewport's corner. */
export function KeycapHint({ keyLabel, children }: KeycapHintProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[7px] border border-line bg-panel px-[9px] py-1 font-mono text-[9px] text-muted">
      <kbd className="rounded-[4px] border border-line-2 px-[5px] py-px text-fg">{keyLabel}</kbd>
      {children}
    </span>
  );
}
