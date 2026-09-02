import { useState } from "react";
import { AccessRow } from "@/entities/territory";
import type { User } from "@/entities/user";
import { RoleChips } from "@/features/role-assign";
import { Callout } from "@/shared/ui/callout";
import { PersonInspector } from "./ui/person-inspector";

const USER: User = {
  id: "u-2",
  username: "d.smirnov",
  email: "d.smirnov@example.com",
  status: "active",
  totpEnabled: false,
  passkeyEnabled: false,
  roleSlugs: ["field-operator"],
  roleTitles: { "field-operator": "field-operator" },
  isOwner: false,
};

const noop = () => {};

function Live() {
  const [roles, setRoles] = useState([{ slug: "field-operator", title: "field-operator" }]);
  return (
    <PersonInspector
      user={USER}
      sessions="2 devices"
      onClose={noop}
      onResetPassword={noop}
      onRequire2fa={noop}
      onFreeze={noop}
      onDelete={noop}
    >
      <Callout tone="bad">No 2FA and no passkey — password only.</Callout>
      <RoleChips
        roles={roles}
        onRemove={(slug) => setRoles((r) => r.filter((role) => role.slug !== slug))}
        onAdd={() => setRoles((r) => [...r, { slug: "guest", title: "guest" }])}
      />
      <div className="flex flex-col gap-1.5">
        <AccessRow slug="refinery-block-c" via="direct" />
        <AccessRow slug="north-ridge-pad" via="role" />
      </div>
    </PersonInspector>
  );
}

export default {
  manager: (
    <div className="max-w-sm rounded-card border border-line bg-panel p-6">
      <Live />
    </div>
  ),
  readOnly: (
    <div className="max-w-sm rounded-card border border-line bg-panel p-6">
      <PersonInspector
        user={{ ...USER, status: "frozen" }}
        canManage={false}
        onClose={noop}
        onResetPassword={noop}
        onRequire2fa={noop}
        onFreeze={noop}
        onDelete={noop}
      />
    </div>
  ),
};
