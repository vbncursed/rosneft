import { Checklist } from "./checklist";

export default (
  <div className="max-w-sm p-6">
    <Checklist
      label="Archive checklist"
      items={[
        { label: "Single ZIP, no nested archives", ok: true },
        { label: "OBJ references its MTL by relative path", ok: true },
        { label: "Textures next to the OBJ, not absolute paths", ok: true },
        { label: "Metres as units — the viewer measures in metres", ok: false },
      ]}
    />
  </div>
);
