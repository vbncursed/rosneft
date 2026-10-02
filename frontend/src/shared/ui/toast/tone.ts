import type { IconName } from "@/shared/ui/icon";

export type ToastTone = "error" | "warning" | "info" | "success" | "neutral" | "loading";

// The ground is the opaque panel, tone or not: a card over the viewer's chrome
// must not let the text beneath read through it (same ground as ModeChip). The
// tone shows in the border, the overline, the icon and the countdown bar.
export const TONE: Record<ToastTone, { label: string; skin: string; icon: IconName | null; life: number | null }> = {
  error: {
    label: "Error",
    icon: "close",
    life: null,
    skin: "border-bad bg-panel text-bad",
  },
  warning: {
    label: "Warning",
    icon: "warning",
    life: null,
    skin: "border-warn bg-panel text-warn",
  },
  info: {
    label: "Info",
    icon: "info",
    life: 4000,
    skin: "border-accent-line bg-panel text-accent",
  },
  success: {
    label: "Success",
    icon: "check",
    life: 4000,
    skin: "border-ok bg-panel text-ok",
  },
  // No tint: a plain fact with nothing to celebrate or fix.
  neutral: { label: "Notice", icon: null, life: 4000, skin: "border-line-2 bg-panel text-muted" },
  // Work under way: the spinner is the icon; it stays until the caller replaces it.
  loading: { label: "Working", icon: null, life: null, skin: "border-line-2 bg-panel text-accent" },
};

/** True for a tone whose card stays until the reader acts (no default lifetime). */
export const waitsForReader = (tone: ToastTone): boolean => TONE[tone].life === null;
