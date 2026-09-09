import { DetailList } from "./detail-list";

export default (
  <div className="max-w-sm rounded-card border border-line bg-panel p-6">
    <DetailList
      items={[
        { label: "actor", value: "a.ivanova · Company Owner" },
        { label: "at", value: "2026-09-01 09:14:22 UTC" },
        { label: "ip", value: "10.42.0.18" },
        { label: "result", value: "ok", tone: "ok" },
        { label: "digest", value: "sha256:9c1f…a204", tone: "muted" },
      ]}
    />
  </div>
);
