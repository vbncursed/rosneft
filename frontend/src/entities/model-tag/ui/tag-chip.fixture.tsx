import { TagChip } from "./tag-chip";

export default {
  tag: (
    <div className="flex gap-2 p-6">
      <TagChip tag={{ slug: "tanks", title: "Tanks" }} />
      <TagChip tag={{ slug: "ungrouped", title: "Ungrouped" }} />
    </div>
  ),
};
