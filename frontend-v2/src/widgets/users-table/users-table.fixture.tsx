import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Menu } from "@/shared/ui/menu";
import { UsersTable } from "./ui/users-table";
import type { User } from "@/entities/user";

const noop = () => {};

const USERS: User[] = [
  {
    id: "1",
    username: "a.ivanova",
    email: "a.ivanova@example.com",
    status: "active",
    totpEnabled: true,
    passkeyEnabled: true,
    roleSlugs: ["root"],
    roleTitles: { root: "Root" },
    isOwner: true,
  },
  {
    id: "2",
    username: "d.smirnov",
    email: "d.smirnov@example.com",
    status: "active",
    totpEnabled: false,
    passkeyEnabled: false,
    roleSlugs: ["field-operator"],
    roleTitles: { "field-operator": "Field Operator" },
    isOwner: false,
  },
  {
    id: "3",
    username: "guest.viewer",
    email: "guest.viewer@example.com",
    status: "frozen",
    totpEnabled: null,
    passkeyEnabled: true,
    roleSlugs: ["guest"],
    roleTitles: { guest: "Guest" },
    isOwner: false,
  },
  {
    id: "4",
    username: "old.account",
    email: "old.account@example.com",
    status: "deleted",
    totpEnabled: null,
    passkeyEnabled: false,
    roleSlugs: ["guest"],
    roleTitles: { guest: "Guest" },
    isOwner: false,
  },
];

const newUser = (
  <Button variant="primary" size="sm">
    + New user
  </Button>
);

export default {
  populated: (
    <div className="p-6">
      <UsersTable
        users={USERS}
        action={newUser}
        renderActions={(user) => (
          <Menu
            triggerLabel={`Actions for ${user.username}`}
            trigger={<Icon name="kebab" size={15} />}
            items={[
              { label: "Edit roles", onSelect: noop },
              { label: "Make Root", onSelect: noop, tone: "accent" },
              { label: "Freeze", onSelect: noop, tone: "warn" },
              { label: "Delete", onSelect: noop, tone: "bad" },
            ]}
          />
        )}
      />
    </div>
  ),
  empty: (
    <div className="p-6">
      <UsersTable users={[]} action={newUser} />
    </div>
  ),
};
