import { useState } from "react";
import { SearchField } from "./search-field";

function Live() {
  const [value, setValue] = useState("");
  return (
    <SearchField
      value={value}
      onChange={setValue}
      label="Search content"
      placeholder="title or slug"
      className="min-w-60"
    />
  );
}

export default (
  <div className="max-w-sm p-6">
    <Live />
  </div>
);
