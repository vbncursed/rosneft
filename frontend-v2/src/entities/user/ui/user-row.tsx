import { clsx as cx } from "clsx";
import type { ReactNode } from "react";
import { Badge } from "@/shared/ui/badge";
import { knownLabel, knownTone, roleTitle, STATUS_TONE, type User } from "../model/user";

export type UserRowProps = {
  user: User;
  /** The row's kebab menu. */
  actions?: ReactNode;
};

export function UserRow({ user, actions }: UserRowProps) {
  return (
    <tr
      className={cx(
        "border-t border-line",
        user.isOwner && "bg-accent-soft",
        user.status === "deleted" && "opacity-50",
      )}
    >
      <td className="px-5 py-3 text-[13px]">{user.username}</td>
      <td className="px-2.5 py-3 text-[13px] text-muted">{user.email}</td>
      <td className="px-2.5 py-3">
        <span className="flex flex-wrap gap-1.5">
          {user.roleSlugs.map((slug) => (
            <Badge
              key={slug}
              size="sm"
              tone={user.isOwner ? "accent" : "neutral"}
              fill={user.isOwner ? "outline" : "soft"}
            >
              {roleTitle(user, slug)}
            </Badge>
          ))}
        </span>
      </td>
      <td className="px-2.5 py-3">
        <Badge size="sm" fill="outline" tone={STATUS_TONE[user.status]}>
          {user.status}
        </Badge>
      </td>
      <td className="px-2.5 py-3">
        <Badge size="sm" fill="outline" tone={knownTone(user.totpEnabled)}>
          {knownLabel(user.totpEnabled)}
        </Badge>
      </td>
      <td className="px-2.5 py-3">
        <Badge size="sm" fill="outline" tone={knownTone(user.passkeyEnabled)}>
          {knownLabel(user.passkeyEnabled)}
        </Badge>
      </td>
      <td className="px-5 py-3 text-right">{actions}</td>
    </tr>
  );
}
