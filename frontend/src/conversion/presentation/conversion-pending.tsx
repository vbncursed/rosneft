"use client";

import Link from "next/link";
import { useConversionWatcher } from "@/conversion/application/use-conversion-watcher";

interface ConversionPendingProps {
  title: string;
  slug: string;
  // jobId is provided when the user just created the entity in this
  // session — we can subscribe to SSE for live progress. When absent
  // (e.g. revisiting a territory whose conversion was queued by the
  // background reconciler), the watcher falls back to polling.
  jobId?: string | null;
}

const STAGE_COPY: Record<string, string> = {
  fetching: "Fetching archive…",
  extracting: "Extracting ZIP…",
  parsing: "Parsing OBJ…",
  encoding: "Building glTF…",
  compressing: "Compressing textures and geometry…",
  registering: "Registering artifacts…",
};

const STATUS_COPY: Record<string, string> = {
  polling: "Waiting for conversion to start…",
  pending: "Job queued.",
  running: "Conversion in progress.",
  succeeded: "Done, refreshing the page…",
  failed: "Conversion failed.",
  unavailable: "Could not subscribe to job status.",
};

function stageLabel(stage: string | null): string | null {
  if (!stage) return null;
  if (STAGE_COPY[stage]) return STAGE_COPY[stage];
  if (stage.startsWith("lod-")) {
    return `LOD ${stage.slice(4)}: writing artifact…`;
  }
  return stage;
}

export default function ConversionPending({
  title,
  slug,
  jobId = null,
}: ConversionPendingProps) {
  const { status, progress, stage, error } = useConversionWatcher(jobId);
  const failed = status === "failed" || status === "unavailable";
  const stageMsg = stageLabel(stage);
  const headline = stageMsg ?? STATUS_COPY[status] ?? STATUS_COPY.running;
  const percent = Math.round(progress * 100);

  return (
    <main className="relative flex h-screen w-screen items-center justify-center bg-black px-6 text-center text-neutral-300">
      <Link
        href="/"
        className="absolute left-4 top-4 cursor-pointer rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.2em] text-white transition-colors duration-200 hover:bg-white/[0.1]"
      >
        ← Catalog
      </Link>
      <div className="w-full max-w-xl space-y-5">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">
          {title}
        </p>
        <h1 className="text-2xl font-semibold text-white">
          {failed ? "Conversion failed" : "Converting model"}
        </h1>
        <p className="text-sm leading-6">
          {headline}
          {!failed && (
            <>
              {" "}
              mesh-worker is processing{" "}
              <code className="rounded bg-white/10 px-2 py-1 text-cyan-200">
                {slug}
              </code>
              .
            </>
          )}
        </p>
        {error ? (
          <p className="rounded-md border border-red-300/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        ) : null}
        {!failed ? (
          <div className="mx-auto w-full max-w-md space-y-2">
            {progress > 0 ? (
              <>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-cyan-300 transition-[width] duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="text-right text-xs tabular-nums text-neutral-400">
                  {percent}%
                </p>
              </>
            ) : (
              <div className="h-1 w-48 mx-auto overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-1/2 animate-pulse bg-cyan-300/60" />
              </div>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
