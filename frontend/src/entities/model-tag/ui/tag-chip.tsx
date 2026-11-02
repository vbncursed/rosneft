import { Badge } from "@/shared/ui/badge";
import type { ModelTag } from "../model/model-tag";

/** A tag as a quiet sentence-case chip. */
export function TagChip({ tag }: { tag: ModelTag }) {
  return (
    <Badge shape="chip" size="md">
      {tag.title}
    </Badge>
  );
}
