import { ThemeToggle } from "@/features/theme-toggle";
import { Avatar } from "@/shared/ui/avatar";
import { viewerOf, type Principal } from "@/shared/session";

export type AccountHeaderProps = { me: Principal };

/** The account screen's identity block: back link, overline, avatar, name, and the theme control. */
export function AccountHeader({ me }: AccountHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="min-w-0">
        <a
          href="/"
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted no-underline hover:text-fg"
        >
          ← Home
        </a>
        <p className="m-0 mt-4 font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
          Account
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-[13px]">
          <Avatar name={me.username} variant="soft" size={44} />
          <div className="min-w-0">
            <h1 className="m-0 text-[28px] font-bold tracking-[-0.025em]">{me.username}</h1>
            <p className="m-0 mt-1 font-mono text-[11px] text-muted">
              {me.email} · {viewerOf(me).roleTitle}
            </p>
          </div>
        </div>
      </div>
      <ThemeToggle variant="compact" />
    </div>
  );
}
