import { useCallback, useState } from "react";
import type { Tour } from "./model/use-tour";
import { VIEWER_TOUR_STEPS } from "./model/viewer-tour-steps";
import { TourOverlay } from "./ui/tour-overlay";
import { TourTooltip } from "./ui/tour-tooltip";

const LAST = VIEWER_TOUR_STEPS.length - 1;

function Tooltip() {
  const [index, setIndex] = useState(2);
  const step = VIEWER_TOUR_STEPS[index];
  return (
    <TourTooltip
      step={index + 1}
      total={VIEWER_TOUR_STEPS.length}
      title={step.title}
      body={step.body}
      onNext={() => setIndex((i) => Math.min(LAST, i + 1))}
      onBack={() => setIndex((i) => Math.max(0, i - 1))}
      onSkip={() => setIndex(0)}
    />
  );
}

// A fake viewer behind the dim: enough chrome to carry a `data-tour` anchor for
// every step the tour lights up, so all eight are browsable here.
function FakeViewer() {
  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="flex items-center gap-4 border-b border-line px-5 py-3.5">
        <span data-tour="catalog-link" className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          ← Territories
        </span>
        <span className="text-sm font-semibold text-fg">Промплощадка Север-2</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="flex flex-col gap-2 border-r border-line p-2.5">
          {(["reset-camera", "measure"] as const).map((id) => (
            <span
              key={id}
              data-tour={id}
              className="size-7 rounded-control border border-line-2 bg-panel-2"
            />
          ))}
        </div>
        <div className="flex-1 bg-panel-2" />
        <aside className="flex w-[300px] flex-col gap-3 border-l border-line bg-panel p-3.5">
          <div data-tour="overlays-tabs" className="flex gap-2">
            <span className="rounded-control-sm border border-accent-line bg-accent-soft px-3 py-1.5 text-xs text-accent">View</span>
            <span className="rounded-control-sm border border-line-2 px-3 py-1.5 text-xs text-muted">Placements</span>
          </div>
          <span data-tour="add-object" className="rounded-control-sm border border-line-2 bg-panel-2 px-3 py-1.5 text-center text-xs text-fg">
            ＋ Add object
          </span>
          <div data-tour="objects-list" className="flex flex-col gap-1.5">
            {["Насос НМ-1250", "Резервуар РВС-5000"].map((name) => (
              <span key={name} className="rounded-control-sm border border-line px-2.5 py-2 text-xs text-muted">
                {name}
              </span>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Overlay() {
  const [index, setIndex] = useState(2);
  // Clamped rather than deactivating, so the fixture never empties itself: the
  // overlay's own "skip a step with no anchor" call lands here too.
  const next = useCallback(() => setIndex((i) => Math.min(LAST, i + 1)), []);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const restart = useCallback(() => setIndex(0), []);

  const tour: Tour = {
    active: true,
    step: VIEWER_TOUR_STEPS[index],
    stepIndex: index,
    total: VIEWER_TOUR_STEPS.length,
    isLast: index === LAST,
    next,
    prev,
    skip: restart,
    restart,
  };

  return (
    <>
      <FakeViewer />
      <TourOverlay tour={tour} />
    </>
  );
}

export default {
  Tooltip: (
    <div className="p-6">
      <Tooltip />
    </div>
  ),
  Overlay: <Overlay />,
};
