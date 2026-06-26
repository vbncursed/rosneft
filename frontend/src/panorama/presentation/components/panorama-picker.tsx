import { useMemo } from "react";
import type { Panorama } from "@/panorama/domain/panorama";
// The View dropdown is the single switcher across all view modes, so it
// aggregates documents alongside panoramas — the one place this presentation
// component reaches into a sibling context.
import type { Document } from "@/document/domain/document";
import Dropdown from "@/shared/presentation/components/dropdown/dropdown";
import type { DropdownOption } from "@/shared/presentation/components/dropdown/dropdown-option";

interface PanoramaPickerProps {
  panoramas: Panorama[];
  documents: Document[];
  activePanoramaId: number | null;
  activeDocumentId: number | null;
  // null = the "3D scene" choice.
  onActivatePanorama: (id: number | null) => void;
  onActivateDocument: (id: number) => void;
}

// Tagged values keep panorama and document ids (both numeric, from different
// tables) from colliding inside the string-based Dropdown.
const SCENE = "scene";
const PANO = "pano:";
const DOC = "doc:";

// PanoramaPicker is the "View" dropdown: switch between the 3D scene, each
// panorama, and each PDF document. Grouped under non-interactive headers.
export default function PanoramaPicker({
  panoramas,
  documents,
  activePanoramaId,
  activeDocumentId,
  onActivatePanorama,
  onActivateDocument,
}: PanoramaPickerProps) {
  const options = useMemo<DropdownOption[]>(() => {
    const opts: DropdownOption[] = [
      { value: "__hdr_territory", label: "Territory", header: true },
      { value: SCENE, label: "3D scene" },
    ];
    if (panoramas.length > 0) {
      opts.push({ value: "__hdr_panoramas", label: "Panoramas", header: true });
      for (const p of panoramas) opts.push({ value: PANO + p.id, label: p.title });
    }
    if (documents.length > 0) {
      opts.push({ value: "__hdr_documents", label: "Documents", header: true });
      for (const d of documents) opts.push({ value: DOC + d.id, label: d.title });
    }
    return opts;
  }, [panoramas, documents]);

  if (panoramas.length === 0 && documents.length === 0) return null;

  const value =
    activeDocumentId != null
      ? DOC + activeDocumentId
      : activePanoramaId != null
        ? PANO + activePanoramaId
        : SCENE;

  return (
    <Dropdown
      label="View"
      ariaLabel="Active view"
      value={value}
      options={options}
      onChange={(v) => {
        if (v.startsWith(DOC)) onActivateDocument(Number(v.slice(DOC.length)));
        else if (v.startsWith(PANO)) onActivatePanorama(Number(v.slice(PANO.length)));
        else onActivatePanorama(null);
      }}
      className="min-w-[180px]"
    />
  );
}
