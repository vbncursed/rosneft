import { Icon } from "@/shared/ui/icon";
import { Menu } from "@/shared/ui/menu";
import { PersonCard } from "./ui/person-card";
import { UserRow } from "./ui/user-row";
import type { User } from "./model/user";

const noop = () => {};

const USERS: User[] = [
  {
    id: "u-1",
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
    id: "u-2",
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
    id: "u-3",
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
    id: "u-4",
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

const HEADS = ["User", "Email", "Roles", "Status", "2FA", "Passkey", ""];

const table = (
  <div className="overflow-hidden rounded-card border border-line bg-panel">
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">
          {HEADS.map((head, i) => (
            <th key={head || i} scope="col" className="px-2.5 py-2.5 font-medium first:px-5">
              {head}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {USERS.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            actions={
              <Menu
                triggerLabel={`Actions for ${user.username}`}
                trigger={<Icon name="kebab" size={15} />}
                items={[
                  { label: "Edit roles", onSelect: noop },
                  { label: "Freeze", onSelect: noop, tone: "warn" },
                  { label: "Delete", onSelect: noop, tone: "bad" },
                ]}
              />
            }
          />
        ))}
      </tbody>
    </table>
  </div>
);

const SEEN: Record<string, [string, string]> = {
  "1": ["all territories", "today 09:14"],
  "2": ["3 territories", "yesterday 18:02"],
  "3": ["2 territories", "18.08 11:05"],
  "4": ["—", "12.05 10:03"],
};

export default {
  table,
  cards: (
    <div className="grid gap-2.5 md:grid-cols-2">
      {USERS.map((user) => (
        <PersonCard
          key={user.id}
          user={user}
          selected={user.id === "2"}
          territories={SEEN[user.id][0]}
          lastSeen={SEEN[user.id][1]}
        />
      ))}
    </div>
  ),
};
