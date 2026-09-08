import { Avatar } from "@/shared/ui/avatar";

export type AccountPillProps = { username: string; roleTitle: string };

/** The header's way into /account: avatar, name and role in one pill. */
export function AccountPill({ username, roleTitle }: AccountPillProps) {
  return (
    <a
      href="/account"
      aria-label={`Open account for ${username}`}
      className="flex items-center gap-[9px] rounded-full border border-line-2 bg-panel py-[5px] pl-[5px] pr-[13px] text-fg no-underline hover:border-accent-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Avatar name={username} variant="soft" size={28} />
      <span className="flex flex-col items-start leading-[1.25]">
        <span className="text-xs font-medium">{username}</span>
        <span className="font-mono text-[9px] tracking-[0.1em] text-muted">{roleTitle}</span>
      </span>
    </a>
  );
}
