import { Badge } from "./badge";

export default (
  <div className="flex flex-col gap-4 rounded-card border border-line bg-panel p-6">
    <div className="p-6 flex flex-wrap items-center gap-2">
      <Badge tone="ok">active</Badge>
      <Badge tone="warn">frozen</Badge>
      <Badge tone="neutral">deleted</Badge>
      <Badge tone="accent">root</Badge>
      <Badge tone="neutral" fill="outline">company owner</Badge>
    </div>
    <div className="p-6 flex flex-wrap items-center gap-2">
      <Badge tone="ok" fill="outline">2FA yes</Badge>
      <Badge tone="bad" fill="outline">2FA no</Badge>
      <Badge tone="dim" fill="outline">2FA —</Badge>
      <Badge tone="bad" shape="tag">failed</Badge>
      <Badge tone="neutral" shape="tag" className="tracking-normal">system</Badge>
      <Badge tone="neutral" fill="outline" shape="tag" size="sm" className="tracking-normal">G</Badge>
    </div>
  </div>
);
