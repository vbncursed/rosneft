import { Badge } from "@/shared/ui/badge";
import type { ConversionStatus } from "../model/status";

const TONE = {
  ready: "ok",
  pending: "neutral",
  converting: "warn",
  failed: "bad",
} as const;

const LABEL: Record<ConversionStatus, string> = {
  ready: "ready",
  pending: "pending",
  converting: "converting",
  failed: "failed",
};

export function ConversionBadge({ status }: { status: ConversionStatus }) {
  return (
    <Badge tone={TONE[status]} fill="outline" size="sm">
      {LABEL[status]}
    </Badge>
  );
}
