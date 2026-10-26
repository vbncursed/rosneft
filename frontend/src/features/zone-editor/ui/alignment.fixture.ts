import type { Alignment } from "../model/use-alignment";

const noop = () => {};

/** An alignment with nothing proposed; each fixture and spec overrides what it is about. */
export const alignmentStub = (over: Partial<Alignment> = {}): Alignment =>
  ({
    pairs: [],
    pending: null,
    awaitingScenePick: false,
    notice: null,
    fit: null,
    residualsM: [],
    fitLine: null,
    scaleLine: null,
    scaleWarn: false,
    metresPerPt: null,
    error: null,
    canSave: false,
    saving: false,
    addPlanPoint: noop,
    cancelPending: noop,
    acceptScenePoint: noop,
    movePair: noop,
    removePair: noop,
    save: noop,
    clear: noop,
    ...over,
  }) as unknown as Alignment;
