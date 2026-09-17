import type { ReactNode } from "react";
import { UserRow, type User } from "@/entities/user";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/card";

export type UsersTableProps = {
  users: User[];
  /** The row's kebab menu, built per user by the caller. */
  renderActions?: (user: User) => ReactNode;
  /** The header's primary action, e.g. "+ New user". */
  action?: ReactNode;
  title?: string;
};

const COLUMNS = ["User", "Email", "Roles", "Status", "2FA", "Passkey"];

export function UsersTable({
  users,
  renderActions,
  action,
  title = "Users",
}: UsersTableProps) {
  if (users.length === 0) {
    return (
      <Card title={title} actions={action}>
        <EmptyState
          title="No users yet"
          description="Invite someone to give them access."
          action={action}
        />
      </Card>
    );
  }

  return (
    <Card title={title} actions={action} padded={false}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="px-2.5 py-2.5 font-medium first:px-5">
                {column}
              </th>
            ))}
            {/* The actions column needs no visible name; the row buttons carry theirs. */}
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <UserRow key={user.id} user={user} actions={renderActions?.(user)} />
          ))}
        </tbody>
      </table>
    </Card>
  );
}
