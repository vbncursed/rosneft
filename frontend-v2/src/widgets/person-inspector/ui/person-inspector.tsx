import { Fragment, type ReactNode } from "react";
import { clsx as cx } from "clsx";
import type { User } from "@/entities/user";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";

export type PersonDetail = {
  label: string;
  value: ReactNode;
  tone?: "ok" | "warn" | "bad" | "dim" | "fg";
};

export type PersonInspectorProps = {
  user: User;
  /** Extra rows under the status, e.g. created / last seen / sessions. */
  details?: PersonDetail[];
  onClose: () => void;
  onResetPassword: () => void;
  onRequire2fa: () => void;
  onFreeze: () => void;
  onDelete: () => void;
  /** Roles editor and anything else the page wants between the two blocks. */
  children?: ReactNode;
  /** Actions are hidden entirely when the reader may not manage people. */
  canManage?: boolean;
};

const DETAIL_TONE = {
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  dim: "text-dim",
  fg: "text-fg",
} as const;

const STATUS_TEXT = {
  active: "text-ok",
  frozen: "text-warn",
  deleted: "text-dim",
} as const;

export function PersonInspector({
  user,
  details = [],
  onClose,
  onResetPassword,
  onRequire2fa,
  onFreeze,
  onDelete,
  children,
  canManage = true,
}: PersonInspectorProps) {
  return (
    <aside aria-label={`Person: ${user.username}`} className="flex flex-col gap-3.5">
      <div className="overflow-hidden rounded-card border border-accent-line">
        <div className="flex items-start gap-3 bg-accent-soft p-4">
          <Avatar name={user.username} size={44} variant="outline" className="text-sm font-bold" />
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-base font-semibold text-fg">{user.username}</p>
            <p className="m-0 mt-[3px] truncate font-mono text-[11px] text-muted">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer border-none bg-transparent p-0 leading-none text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            ×
          </button>
        </div>

        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2.5 px-4 py-3.5 font-mono text-[11px]">
          <dt className="text-dim">status</dt>
          <dd className={cx("m-0", STATUS_TEXT[user.status])}>{user.status}</dd>

          {details.map((detail) => (
            <Fragment key={detail.label}>
              <dt className="text-dim">{detail.label}</dt>
              <dd className={cx("m-0", DETAIL_TONE[detail.tone ?? "fg"])}>{detail.value}</dd>
            </Fragment>
          ))}
        </dl>
      </div>

      {children}

      {canManage ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 justify-center" onClick={onResetPassword}>
              Reset password
            </Button>
            <Button
              size="sm"
              variant="accent"
              className="flex-1 justify-center"
              onClick={onRequire2fa}
            >
              Require 2FA
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="warning"
              className="flex-1 justify-center"
              onClick={onFreeze}
            >
              {user.status === "frozen" ? "Unfreeze" : "Freeze"}
            </Button>
            <Button size="sm" variant="danger" className="flex-1 justify-center" onClick={onDelete}>
              Delete
            </Button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
