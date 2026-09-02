import { useState } from "react";
import { PeopleGroups, type PeopleGroup } from "./ui/people-groups";
import type { User } from "@/entities/user";

const make = (id: string, username: string, over: Partial<User> = {}): User => ({
  id,
  username,
  email: `${username}@example.com`,
  status: "active",
  totpEnabled: true,
  passkeyEnabled: true,
  roleSlugs: ["field-operator"],
  roleTitles: { "field-operator": "field-operator" },
  isOwner: false,
  ...over,
});

const GROUPS: PeopleGroup[] = [
  {
    key: "admins",
    label: "Owners & admins",
    total: 3,
    people: [
      {
        user: make("u-1", "a.ivanova", { isOwner: true, roleSlugs: ["root"], roleTitles: { root: "root" } }),
        territories: "all territories",
        lastSeen: "today 09:14",
      },
      { user: make("u-2", "m.orlova"), territories: "6 territories", lastSeen: "today 08:31" },
    ],
  },
  {
    key: "ops",
    label: "Field operators",
    total: 11,
    people: [
      {
        user: make("u-3", "d.smirnov", { totpEnabled: false, passkeyEnabled: false }),
        territories: "3 territories",
        lastSeen: "yesterday 18:02",
      },
      {
        user: make("u-4", "n.baranov", { status: "frozen" }),
        territories: "2 territories",
        lastSeen: "18.08 11:05",
      },
    ],
  },
];

function Live() {
  const [selected, setSelected] = useState<string | null>("u-3");
  return <PeopleGroups groups={GROUPS} selectedId={selected} onSelect={setSelected} />;
}

export default {
  grouped: (
    <div className="p-6 max-w-3xl">
      <Live />
    </div>
  ),
  filteredToNothing: (
    <div className="p-6 max-w-3xl">
      <PeopleGroups groups={[{ key: "ops", label: "Field operators", people: [] }]} />
    </div>
  ),
};
