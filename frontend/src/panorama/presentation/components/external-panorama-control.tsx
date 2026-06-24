"use client";

import { useState } from "react";
import { useTerritoryLink } from "@/territory/application/use-territory-link";
import ExternalPanoramaLink from "@/panorama/presentation/components/external-panorama-link";

interface ExternalPanoramaControlProps {
  territorySlug: string;
  initialUrl?: string;
  // Gates editing the tour URL; the read-only link stays visible regardless.
  canEdit: boolean;
}

// ExternalPanoramaControl wraps the read-only ExternalPanoramaLink with an
// inline editor so an operator can add/change/clear the territory's external
// panorama URL straight from the viewer — the same in-scene editing model
// the placements and panorama-anchor tools already use. No separate settings
// page; persistence is a PATCH that never re-converts the mesh.
export default function ExternalPanoramaControl({
  territorySlug,
  initialUrl,
  canEdit,
}: ExternalPanoramaControlProps) {
  const { url, saving, save } = useTerritoryLink(territorySlug, initialUrl);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(url);

  const openEditor = () => {
    setDraft(url);
    setEditing(true);
  };

  const onSave = async () => {
    if (await save(draft.trim())) setEditing(false);
  };

  if (editing && canEdit) {
    return (
      <div className="pointer-events-auto w-full rounded-xl border border-white/20 bg-black/50 p-3 shadow-xl backdrop-blur">
        <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-neutral-400">
          Panorama tour URL
        </label>
        <input
          type="url"
          value={draft}
          autoFocus
          placeholder="https://…"
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="cursor-pointer rounded-md bg-cyan-300 px-3 py-1.5 text-xs font-semibold text-neutral-900 transition-colors hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="cursor-pointer rounded-md border border-white/15 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <ExternalPanoramaLink url={url} />
      {canEdit ? (
        <button
          type="button"
          onClick={openEditor}
          className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-white/20 bg-black/50 px-3 py-2 text-xs font-medium text-neutral-200 shadow-xl backdrop-blur transition-colors hover:bg-black/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          {url ? "Edit link" : "+ Panorama link"}
        </button>
      ) : null}
    </div>
  );
}
