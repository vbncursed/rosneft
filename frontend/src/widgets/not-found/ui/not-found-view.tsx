import { linkButtonClass } from "@/shared/ui/button";

export type NotFoundKind = "page" | "territory" | "model";

export type NotFoundViewProps = {
  kind: NotFoundKind;
  /** The address that missed. The live location unless a fixture pins one. */
  path?: string;
};

// Copy from `Not Found v2.dc.html`, word for word. A territory and a model say
// "deleted" and "no access" in one breath because the gateway answers 404 for
// both — a 403 would confirm the thing exists — so this page cannot tell them
// apart either.
const COPY: Record<NotFoundKind, { title: string; body: string; primary: string; href: string }> = {
  page: {
    title: "This page doesn't exist",
    body: "The address may have a typo, or the page was moved when the console was rebuilt. Nothing on your side was changed.",
    primary: "Go to territories",
    href: "/territories",
  },
  territory: {
    title: "No territory at this address",
    body: "It may have been deleted or renamed, or your role has no access to it. Both look the same from here — ask an admin if you expected to see it.",
    primary: "Browse territories",
    href: "/territories",
  },
  model: {
    title: "No model at this address",
    body: "It may have been deleted from the library, or your role has no access to it. Placements that used it are listed on each territory.",
    primary: "Browse models",
    href: "/models",
  },
};

/** A ruler with its first point placed and the second nowhere: the viewer's measure tool, missing its target. */
function Scene({ path }: { path: string }) {
  return (
    <div
      aria-hidden="true"
      className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line bg-panel bg-[linear-gradient(var(--grid)_1px,transparent_1px),linear-gradient(90deg,var(--grid)_1px,transparent_1px)] bg-size-[40px_40px] shadow-elevation"
    >
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 size-full">
        <path d="M92 214 L308 86" stroke="var(--line-2)" strokeWidth="2" strokeDasharray="6 7" strokeLinecap="round" />
        <circle cx="92" cy="214" r="10" fill="var(--panel)" stroke="var(--accent)" strokeWidth="3" />
        <circle cx="308" cy="86" r="10" fill="none" stroke="var(--dim)" strokeWidth="2" strokeDasharray="3 4" />
      </svg>
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-control border border-accent bg-panel px-3 py-1.5 font-mono text-[clamp(22px,4vw,40px)] font-medium text-accent shadow-elevation">
        404
      </span>
      <div className="absolute left-3.5 top-3.5 rounded-control border border-accent bg-accent-soft px-[11px] py-[5px] font-mono text-[10px] tracking-[0.1em] text-accent">
        measure · second point not found
      </div>
      <div className="absolute bottom-3.5 left-3.5 right-3.5 flex flex-wrap gap-x-3.5 gap-y-1 rounded-control-lg border border-line-2 bg-panel px-3.5 py-[9px] font-mono text-[10px] text-muted sm:right-auto">
        <span className="break-all text-fg">{path}</span>
        <span>no scene at this address</span>
      </div>
    </div>
  );
}

/** The 404 body: the scene, what is missing, the address asked for, and the ways out. */
export function NotFoundView({ kind, path = window.location.pathname }: NotFoundViewProps) {
  const copy = COPY[kind];
  return (
    <div className="mx-auto grid w-full max-w-[1180px] flex-1 grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-center gap-7">
      <Scene path={path} />
      <div className="flex min-w-0 flex-col gap-4">
        <p className="m-0 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">Error 404 · not found</p>
        <h1 className="m-0 text-[clamp(30px,4vw,44px)] font-bold leading-[1.05] tracking-[-0.03em] text-balance">
          {copy.title}
        </h1>
        <p className="m-0 max-w-[52ch] text-[15px] leading-[1.6] text-pretty text-muted">{copy.body}</p>
        <div className="flex max-w-full min-w-0 items-center gap-2 self-start rounded-[9px] border border-line bg-panel px-3 py-[9px]">
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-dim">Requested</span>
          <span className="truncate font-mono text-xs text-fg">{path}</span>
        </div>
        <div className="flex flex-wrap items-center gap-[9px] pt-1">
          <a href={copy.href} className={linkButtonClass("primary")}>
            {copy.primary}
          </a>
          <a href="/" className={linkButtonClass("secondary")}>
            Go to home
          </a>
        </div>
      </div>
    </div>
  );
}
