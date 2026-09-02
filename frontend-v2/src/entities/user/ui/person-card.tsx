import { clsx as cx } from "clsx";
import { Avatar } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { roleTitle, type User } from "../model/user";

export type PersonCardProps = {
  user: User;
  selected?: boolean;
  onSelect?: () => void;
  /** e.g. "3 territories", or "—" for none. */
  territories: string;
  /** e.g. "today 09:14". */
  lastSeen: string;
};

const STATUS_DOT = {
  active: "bg-ok",
  frozen: "bg-warn",
  deleted: "bg-dim",
} as const;

/** A person as a card — the grid form of the users table. */
export function PersonCard({
  user,
  selected = false,
  onSelect,
  territories,
  lastSeen,
}: PersonCardProps) {
  const weakAuth = user.totpEnabled === false && user.passkeyEnabled === false;

  return (
    <article
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      aria-label={user.username}
      className={cx(
        "cursor-pointer rounded-card border px-4 py-3.5 transition-colors duration-150",
        selected ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-line-2",
        user.status === "deleted" && "opacity-55",
      )}
    >
      <div className="flex items-center gap-2.5">
        <Avatar name={user.username} size={34} variant={user.isOwner ? "soft" : "plain"} />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[13px] font-semibold text-fg">{user.username}</p>
          <p className="m-0 mt-0.5 truncate font-mono text-[10px] text-muted">{user.email}</p>
        </div>
        <span
          // The status is also spelled out in the chip row below; this is the
          // glanceable repeat, not the only carrier.
          aria-hidden="true"
          className={cx("size-[7px] shrink-0 rounded-full", STATUS_DOT[user.status])}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {user.roleSlugs.map((slug) => (
          <Badge
            key={slug}
            shape="chip"
            tone={user.isOwner ? "accent" : "neutral"}
            fill="soft"
          >
            {roleTitle(user, slug)}
          </Badge>
        ))}

        {user.status === "active" ? (
          <>
            <Badge shape="chip" fill="outline" tone={user.totpEnabled ? "ok" : "bad"}>
              {user.totpEnabled === null ? "2fa —" : user.totpEnabled ? "2fa" : "no 2fa"}
            </Badge>
            <Badge shape="chip" fill="outline" tone={user.passkeyEnabled ? "ok" : "bad"}>
              {user.passkeyEnabled === null ? "passkey —" : user.passkeyEnabled ? "passkey" : "no passkey"}
            </Badge>
          </>
        ) : (
          <Badge shape="chip" fill="outline" tone="dim">
            {user.status}
          </Badge>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-2.5 font-mono text-[10px] text-dim">
        <span>{territories}</span>
        <span>{lastSeen}</span>
      </div>

      {weakAuth ? <span className="sr-only">Password only — no 2FA and no passkey.</span> : null}
    </article>
  );
}
