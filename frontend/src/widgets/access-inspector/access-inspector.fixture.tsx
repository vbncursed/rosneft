import { useState } from "react";
import type { AccessGrant, TerritoryAccess, Visibility } from "@/entities/territory";
import { AccessInspector } from "./ui/access-inspector";

const noop = () => {};

const territory: TerritoryAccess = {
  slug: "refinery-block-c",
  title: "Refinery Block C",
  visibility: "assigned",
  meta: "refinery-block-c · 14 placements · upd. 29.08",
  faces: ["a.ivanova", "m.orlova", "k.petrov"],
  peopleLabel: "4 people",
};

const GRANTS: AccessGrant[] = [
  { userId: "u-1", username: "a.ivanova", roleTitle: "Company Owner", via: "owner" },
  { userId: "u-2", username: "m.orlova", roleTitle: "People & Roles Manager", via: "role" },
  { userId: "u-3", username: "k.petrov", roleTitle: "Field Operator", via: "direct" },
  { userId: "u-4", username: "guest.viewer", roleTitle: "Guest · frozen", via: "direct", inactive: true },
];

function Live() {
  const [visibility, setVisibility] = useState<Visibility>("assigned");
  const [grants, setGrants] = useState(GRANTS);
  const [dirty, setDirty] = useState(false);

  return (
    <AccessInspector
      territory={territory}
      visibility={visibility}
      grants={grants}
      dirty={dirty}
      onVisibilityChange={(v) => {
        setVisibility(v);
        setDirty(true);
      }}
      onAddPerson={noop}
      onRemoveGrant={(id) => {
        setGrants((g) => g.filter((grant) => grant.userId !== id));
        setDirty(true);
      }}
      onClose={noop}
      onCancel={() => {
        setGrants(GRANTS);
        setVisibility("assigned");
        setDirty(false);
      }}
      onSave={() => setDirty(false)}
    />
  );
}

export default {
  assigned: (
    <div className="max-w-sm p-6">
      <Live />
    </div>
  ),
  wholeCompany: (
    <div className="max-w-sm p-6">
      <AccessInspector
        territory={{ ...territory, visibility: "company" }}
        visibility="company"
        grants={GRANTS}
        onVisibilityChange={noop}
        onAddPerson={noop}
        onRemoveGrant={noop}
        onClose={noop}
        onCancel={noop}
        onSave={noop}
      />
    </div>
  ),
};
