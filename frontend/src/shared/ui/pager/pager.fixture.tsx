import { useState } from "react";
import { Pager } from "./pager";

function Live() {
  const [page, setPage] = useState(1);
  return <Pager page={page} pageCount={31} onPage={setPage} />;
}

export default (
  <div className="p-6 flex flex-col gap-4">
    <Live />
    <Pager page={5} pageCount={31} onPage={() => {}} />
    <Pager page={2} pageCount={3} onPage={() => {}} />
    <Pager page={2} pageCount={3} onPage={() => {}} busy />
  </div>
);
