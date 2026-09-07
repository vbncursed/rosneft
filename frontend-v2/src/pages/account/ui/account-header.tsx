import { ThemeToggle } from "@/features/theme-toggle";
import { Avatar } from "@/shared/ui/avatar";
import type { Principal } from "@/shared/session";

export type AccountHeaderProps = { me: Principal };

// Mirrors app/router/guard.ts's viewerOf: first role slug through
// roleTitles, falling back to "Root" for an ownerless owner and "—"
// otherwise. Not imported — pages may not reach into app, one layer up.
function roleTitleOf(me: Principal): string {
  const first = me.roleSlugs[0];
  if (first) return me.roleTitles[first] ?? first;
  return me.isOwner ? "Root" : "—";
}

/** The account screen's identity block: back link, overline, avatar, name, and the theme control. */
export function AccountHeader({ me }: AccountHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="min-w-0">
        <a
          href="/console"
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted no-underline hover:text-fg"
        >
          ← Back to console
        </a>
        <p className="m-0 mt-4 font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
          Account
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-[13px]">
          <Avatar name={me.username} variant="soft" size={44} />
          <div className="min-w-0">
            <h1 className="m-0 text-[28px] font-bold tracking-[-0.025em]">{me.username}</h1>
            <p className="m-0 mt-1 font-mono text-[11px] text-muted">
              {me.email} · {roleTitleOf(me)}
            </p>
          </div>
        </div>
      </div>
      <ThemeToggle variant="compact" />
    </div>
  );
}
