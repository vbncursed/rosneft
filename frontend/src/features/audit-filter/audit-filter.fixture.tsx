import { useState } from "react";
import { FilterBar } from "./ui/filter-bar";

function Live() {
  const [query, setQuery] = useState("entity:territory");
  return <FilterBar query={query} onChange={setQuery} />;
}

export default (
  <div className="flex max-w-3xl flex-col gap-4 rounded-card border border-line bg-panel p-6">
    <Live />
    <FilterBar query="" onChange={() => {}} />
    <FilterBar query="entity:territory actor:a.ivanova failed:true" onChange={() => {}} />
  </div>
);
