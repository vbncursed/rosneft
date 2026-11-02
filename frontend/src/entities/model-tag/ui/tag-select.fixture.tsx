import { useState } from "react";
import { TagSelect } from "./tag-select";

const TAGS = [
  { slug: "tanks", title: "Tanks" },
  { slug: "pumps", title: "Pumps" },
  { slug: "ungrouped", title: "Ungrouped" },
];

function Loaded() {
  const [value, setValue] = useState<string | null>(null);
  return <TagSelect tags={TAGS} value={value} onChange={setValue} />;
}

export default {
  loaded: (
    <div className="max-w-xs p-6">
      <Loaded />
    </div>
  ),
  loading: (
    <div className="max-w-xs p-6">
      <TagSelect tags={undefined} value={null} onChange={() => {}} />
    </div>
  ),
  error: (
    <div className="max-w-xs p-6">
      <TagSelect tags={undefined} value={null} onChange={() => {}} error="Tags could not be loaded. Try again." />
    </div>
  ),
};
