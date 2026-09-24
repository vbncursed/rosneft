import { NotFoundView } from "./ui/not-found-view";

const frame = "flex min-h-dvh bg-bg px-4 py-8 text-fg sm:px-9";

export default {
  page: (
    <div className={frame}>
      <NotFoundView kind="page" path="/admin/reports" />
    </div>
  ),
  territory: (
    <div className={frame}>
      <NotFoundView kind="territory" path="/territories/refinery-block-x" />
    </div>
  ),
  model: (
    <div className={frame}>
      <NotFoundView kind="model" path="/models/storage-tank-900" />
    </div>
  ),
};
