import { Suspense, useCallback, useState, type ReactNode } from "react";
import { clsx as cx } from "clsx";
import type { Artifact } from "@/entities/content";
import type { ConversionStatus } from "@/entities/conversion";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { ViewerSkeleton } from "@/widgets/viewer-skeleton";
import { ModelCanvas, type LodReport } from "@/widgets/viewer-canvas";
import { IDLE_REPORT, viewportState, type ViewportMessage } from "../model/viewport";

export type ModelViewportProps = { slug: string; title: string; status: ConversionStatus; artifacts: Artifact[] };

const GRID = {
  backgroundImage:
    "linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)",
  backgroundSize: "32px 32px",
};

/** The model page's 3D viewport: the same scene engine as the territory, one model, no tools. */
export function ModelViewport({ slug, title, status, artifacts }: ModelViewportProps) {
  const [report, setReport] = useState<LodReport>(IDLE_REPORT);
  const [retryVersion, setRetryVersion] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const onRetry = useCallback(() => setRetryVersion((v) => v + 1), []);
  const onUnavailable = useCallback(() => setUnavailable(true), []);
  const view = viewportState({ slug, status, artifacts, report, unavailable });

  return (
    <section
      aria-label={`3D preview of ${title}`}
      style={GRID}
      className="relative h-[420px] overflow-hidden rounded-[14px] border border-line bg-panel-2 sm:h-[560px]"
    >
      {view.kind === "message" ? (
        <Message {...view.message} />
      ) : (
        <>
          <div
            className={cx(
              "absolute inset-0 transition-opacity duration-200 ease-out",
              view.loading || view.failure ? "opacity-0" : "opacity-100",
            )}
          >
            <Suspense fallback={null}>
              <ModelCanvas
                lods={artifacts}
                retryVersion={retryVersion}
                onLod={setReport}
                onUnavailable={onUnavailable}
              />
            </Suspense>
          </div>
          {view.loading ? (
            <Centred>
              <ViewerSkeleton label="Loading model…" />
            </Centred>
          ) : null}
          {view.failure ? (
            <Centred>
              <LoadError file={view.failure.file} status={view.failure.status} onRetry={onRetry} />
            </Centred>
          ) : null}
          {view.upgrade ? (
            <p className="absolute bottom-3 left-3 m-0 rounded-full border border-line bg-panel/90 px-3 py-1 font-mono text-[11px] tabular-nums text-muted">
              {view.upgrade}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function Centred({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3.5">{children}</div>;
}

function Message({ title, body }: ViewportMessage) {
  return (
    <Centred>
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="text-line-2">
          <Icon name="cube" size={72} strokeWidth={0.7} />
        </span>
        <p className="m-0 text-sm text-fg">{title}</p>
        <p className="m-0 max-w-[34ch] text-xs leading-[1.5] text-muted">{body}</p>
      </div>
    </Centred>
  );
}

function LoadError({ file, status, onRetry }: { file: string; status: number | null; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="pointer-events-auto flex max-w-full flex-col gap-3 rounded-card border border-line bg-panel p-5 shadow-elevation"
    >
      <p className="m-0 flex items-center gap-2 text-sm text-fg">
        <Icon name="warning" size={16} className="shrink-0 text-bad" />
        {`Couldn't load ${file}${status === null ? "" : ` (HTTP ${status})`}`}
      </p>
      <div>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}
