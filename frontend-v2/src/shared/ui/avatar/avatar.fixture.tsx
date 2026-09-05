import { Avatar } from "./avatar";

export default (
  <div className="flex items-center gap-2.5 rounded-card border border-line bg-panel p-6">
    <Avatar name="a.ivanova" />
    <Avatar name="d.smirnov" variant="solid" />
    <Avatar name="n.baranov" variant="soft" />
    <Avatar name="guest.viewer" size={28} />
  </div>
);
