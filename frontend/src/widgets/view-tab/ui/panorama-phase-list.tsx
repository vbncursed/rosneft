import { useRef, useState } from "react";
import { PANORAMA_PHASES, type PanoramaPhase, type PhaseHidden } from "@/entities/panorama";
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
  /** Resolves to whether it landed — a landed move sends focus to the destination (D5 fix). */
  onMove: (ids: number[], phase: PanoramaPhase) => Promise<boolean>;
  onSetPhaseHidden: (phase: PanoramaPhase, hidden: boolean) => void;
};

export type PanoramaPhaseListProps = {
  /** The list's id — the section head's `aria-controls`. */
  id: string;
  /** The section fold. Folded, the `<ul>` stays, empty and hidden, and mounts no rows. */
  open: boolean;
  rows: PanoramaRowView[];
  /** The id a just-finished upload landed as. Opens its phase once; a later manual fold still works (follow-up 2). */
  justAddedId: number | null;
  phases: PanoramaPhasesView;
  onEnter: (id: number) => void;
  onExit: () => void;
  onEdit: (id: number) => void;
};

const LIST = "m-0 flex list-none flex-col gap-[9px] p-0";
const NESTED = "m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0";
const ALL_PHASES: readonly PanoramaPhase[] = PANORAMA_PHASES.map((p) => p.phase);

/**
 * The Panoramas list as three job phases: each a disclosure with its count and,
 * for an editor, its eye, then its captures. All three start folded on entry;
 * a phase holding the capture the reader stands in or edits stays open
 * regardless, as a placement group holding the selection does, and so does the
 * phase a capture was just uploaded into — once, not pinned: folding it after
 * still works. Each phase's fold is this list's own and is not remembered.
 */
export function PanoramaPhaseList({ id, open, rows, justAddedId, phases, onEnter, onExit, onEdit }: PanoramaPhaseListProps) {
  const [folded, setFolded] = useState<readonly PanoramaPhase[]>(ALL_PHASES);
  const toggle = (phase: PanoramaPhase) =>
    setFolded((prev) => (prev.includes(phase) ? prev.filter((p) => p !== phase) : [...prev, phase]));

  // Unfolds the phase a finished upload landed in — once per upload, keyed on
  // its id so two uploads into the same phase each open it again even if the
  // reader folded it in between. Adjusted during render (React's own pattern
  // for state derived from a prop) rather than an effect, so the phase opens
  // in the same commit as the new row instead of a folded-then-open flash,
  // and a manual fold afterward is never revisited by this check again.
  const [seenAddedId, setSeenAddedId] = useState<number | null>(null);
  if (justAddedId !== null && justAddedId !== seenAddedId) {
    setSeenAddedId(justAddedId);
    const landedPhase = rows.find((r) => r.id === justAddedId)?.phase;
    if (landedPhase) setFolded((prev) => prev.filter((p) => p !== landedPhase));
  }

  const { canWrite } = phases;
  const list = useRef<HTMLUListElement>(null);

  // A landed move leaves the row's own phase, taking the Move trigger that
  // held focus with it — Menu already returned focus there before calling
  // onSelect (widgets/placements-panel's `focusNeighbour` precedent). The
  // destination's disclosure is the one control that never unmounts (an
  // editor always renders all three), folded or not, so focus goes there
  // instead. A refused move changes nothing, so focus is left exactly where
  // Menu put it.
  const moveTo = (ids: number[], phase: PanoramaPhase) => {
    void phases.onMove(ids, phase).then((moved) => {
      if (!moved) return;
      list.current?.querySelector<HTMLButtonElement>(`li[data-phase="${phase}"] button[aria-expanded]`)?.focus();
    });
  };

  return (
    <ul id={id} ref={list} hidden={!open} role="list" data-tour="panorama-picker" className={LIST}>
      {open
        ? phaseSections(rows, phases.hidden, canWrite).map((section) => {
            const holdsSelection = section.rows.some((r) => r.active || r.editing);
            const expanded = holdsSelection || !folded.includes(section.phase);
            return (
              <li key={section.phase} data-phase={section.phase}>
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
                          onMove={canWrite ? (rowId, phase) => moveTo([rowId], phase) : undefined}
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
