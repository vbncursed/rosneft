import { CatalogShell } from "./ui/catalog-shell";

export default (
  <CatalogShell>
    <h1 className="m-0 text-[38px] font-bold tracking-[-0.03em]">Scenes to walk through</h1>
    {Array.from({ length: 8 }, (_, i) => (
      <p key={i} className="m-0 rounded-control border border-line bg-panel px-4 py-3 text-[13px] text-muted">
        Row {i + 1} — the catalog shell carries no sidebar.
      </p>
    ))}
  </CatalogShell>
);
