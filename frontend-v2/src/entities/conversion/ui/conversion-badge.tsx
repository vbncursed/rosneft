import { Badge } from "@/shared/ui/badge";
import type { ConversionStatus } from "../model/status";

const TONE = {
  ready: "ok",
  converting: "warn",
  failed: "bad",
} as const;

const LABEL: Record<ConversionStatus, string> = {
  ready: "ready",
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
