import { CatalogShell } from "@/widgets/catalog-shell";
import { StorageSection, type StorageSectionProps } from "./ui/storage-section";

const GIB = 1024 ** 3;
const noop = async () => {};

const base: StorageSectionProps = {
  usage: { used: 3.4 * GIB, pinned: 2 * GIB, limit: 10 * GIB },
  usageFailed: false,
  savedLoaded: true,
  saved: [
    { slug: "ust-kut", title: "Ust-Kut", bytes: 2 * GIB, savedAt: "2026-09-30T08:00:00Z", syncedAt: "2026-10-01T08:00:00Z" },
    { slug: "refinery-block-c", title: "Refinery block C", bytes: 1.2 * GIB, savedAt: "2026-09-12T10:30:00Z", syncedAt: "2026-09-12T10:30:00Z" },
  ],
  onLimit: noop,
  onClear: noop,
  onRemove: noop,
};

const shell = (over: Partial<StorageSectionProps>) => (
  <CatalogShell>
    <div className="mx-auto w-full max-w-[880px]">
      <StorageSection {...base} {...over} />
    </div>
  </CatalogShell>
);

export default {
  ready: shell({}),
  "nothing saved": shell({ saved: [], usage: { used: 0.2 * GIB, pinned: 0, limit: 10 * GIB } }),
  "over the limit": shell({ usage: { used: 12 * GIB, pinned: 12 * GIB, limit: 10 * GIB } }),
  loading: shell({ usage: null, savedLoaded: false, saved: [] }),
  "usage unavailable": shell({ usage: null, usageFailed: true }),
};
