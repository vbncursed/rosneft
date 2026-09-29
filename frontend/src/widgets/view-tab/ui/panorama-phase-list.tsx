import { useState } from "react";
import type { PanoramaPhase, PhaseHidden } from "@/entities/panorama";
import { EyeButton, GroupRow } from "@/shared/ui/group-controls";
import { phaseLine } from "../model/copy";
import { phaseSections } from "../model/phase-sections";
import { PanoramaRow, type PanoramaRowView } from "./panorama-row";

/** The job phases' flags and the shared hide/move writes — all `panorama:write` (spec §3). */
export type PanoramaPhasesView = {
  hidden: PhaseHidden;
  /** The eyes and the move menus; without it hidden phases and captures are not listed at all. */
  canWrite: boolean;
  pendingIds: number[];
  pendingPhases: readonly PanoramaPhase[];
  onSetHidden: (ids: number[], hidden: boolean) => void;
  onMove: (ids: number[], phase: PanoramaPhase) => void;
  onSetPhaseHidden: (phase: PanoramaPhase, hidden: boolean) => void;
};

export type PanoramaPhaseListProps = {
  /** The list's id — the section head's `aria-controls`. */
  id: string;
  /** The section fold. Folded, the `<ul>` stays, empty and hidden, and mounts no rows. */
  open: boolean;
  rows: PanoramaRowView[];
  phases: PanoramaPhasesView;
  onEnter: (id: number) => void;
  onExit: () => void;
  onEdit: (id: number) => void;
};

const LIST = "m-0 flex list-none flex-col gap-[9px] p-0";
const NESTED = "m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0";

/**
 * The Panoramas list as three job phases: each a disclosure with its count and,
 * for an editor, its eye, then its captures. A phase holding the capture the
 * reader stands in or edits stays open, as a placement group holding the
 * selection does. Each phase's fold is this list's own and is not remembered.
 */
export function PanoramaPhaseList({ id, open, rows, phases, onEnter, onExit, onEdit }: PanoramaPhaseListProps) {
  const [folded, setFolded] = useState<readonly PanoramaPhase[]>([]);
  const toggle = (phase: PanoramaPhase) =>
    setFolded((prev) => (prev.includes(phase) ? prev.filter((p) => p !== phase) : [...prev, phase]));
  const { canWrite } = phases;

  return (
    <ul id={id} hidden={!open} role="list" data-tour="panorama-picker" className={LIST}>
      {open
        ? phaseSections(rows, phases.hidden, canWrite).map((section) => {
            const holdsSelection = section.rows.some((r) => r.active || r.editing);
            const expanded = holdsSelection || !folded.includes(section.phase);
            return (
              <li key={section.phase}>
                <GroupRow
                  title={section.label}
                  line={phaseLine(section.rows.length, section.hidden)}
                  expanded={expanded}
                  holdsSelection={holdsSelection}
                  onToggle={() => toggle(section.phase)}
                  actions={
                    canWrite ? (
                      <EyeButton
                        state={section.hidden ? "hidden" : "visible"}
                        subject={`phase ${section.label}`}
                        busy={phases.pendingPhases.includes(section.phase)}
                        onToggle={(hidden) => phases.onSetPhaseHidden(section.phase, hidden)}
                      />
                    ) : undefined
                  }
                />
                {expanded && section.rows.length > 0 ? (
                  <ul role="list" className={NESTED}>
                    {section.rows.map((row) => (
                      <li key={row.id}>
                        <PanoramaRow
                          row={row}
                          phaseHidden={section.hidden}
                          pending={phases.pendingIds.includes(row.id)}
                          onEnter={onEnter}
                          onExit={onExit}
                          onEdit={onEdit}
                          onHide={canWrite ? (rowId, hidden) => phases.onSetHidden([rowId], hidden) : undefined}
                          onMove={canWrite ? (rowId, phase) => phases.onMove([rowId], phase) : undefined}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })
        : null}
    </ul>
  );
}
