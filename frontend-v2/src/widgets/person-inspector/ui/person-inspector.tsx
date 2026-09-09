import type { ReactNode } from "react";
import type { User } from "@/entities/user";
import { Avatar } from "@/shared/ui/avatar";
import { DetailList, type Detail } from "@/shared/ui/detail-list";
import { Button } from "@/shared/ui/button";

export type PersonDetail = Detail;

export type PersonInspectorProps = {
  user: User;
  /** Extra rows under the status, e.g. created / last seen / sessions. */
  details?: PersonDetail[];
  onClose: () => void;
  /** Absent while no endpoint exists for it — the button is then not drawn. */
  onResetPassword?: () => void;
  onRequire2fa: () => void;
  onFreeze: () => void;
  onDelete: () => void;
  /** Roles editor and anything else the page wants between the two blocks. */
  children?: ReactNode;
  /** Actions are hidden entirely when the reader may not manage people. */
  canManage?: boolean;
};

const STATUS_TONE = {
  active: "ok",
  frozen: "warn",
  deleted: "dim",
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

        <DetailList
          className="px-4 py-3.5"
          items={[{ label: "status", value: user.status, tone: STATUS_TONE[user.status] }, ...details]}
        />
      </div>

      {children}

      {canManage ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {onResetPassword ? (
              <Button size="sm" className="flex-1 justify-center" onClick={onResetPassword}>
                Reset password
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="accent"
              className="flex-1 justify-center"
              onClick={onRequire2fa}
            >
              {user.totpRequired ? "Stop requiring 2FA" : "Require 2FA"}
            </Button>
          </div>
          <div className="flex gap-2">
            {/* A deleted account cannot be frozen; restoring it is the only way back. */}
            {user.status === "deleted" ? null : (
              <Button
                size="sm"
                variant="warning"
                className="flex-1 justify-center"
                onClick={onFreeze}
              >
                {user.status === "frozen" ? "Unfreeze" : "Freeze"}
              </Button>
            )}
            <Button
              size="sm"
              variant={user.status === "deleted" ? "primary" : "danger"}
              className="flex-1 justify-center"
              onClick={onDelete}
            >
              {user.status === "deleted" ? "Restore" : "Delete"}
            </Button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
