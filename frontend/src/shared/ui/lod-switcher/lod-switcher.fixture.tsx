import { LodSwitcher } from "./lod-switcher";

export default {
  // Mock state 1 — the requested level is already on screen.
  idle: (
    <div className="rounded-card border border-line bg-panel p-6">
      <LodSwitcher levels={[0, 1, 2]} choice={1} target={1} shown={1} onChange={() => {}} />
    </div>
  ),
  // Mock state 3 — LOD 0 was requested; LOD 2 still shows while it downloads.
  loading: (
    <div className="rounded-card border border-line bg-panel p-6">
      <LodSwitcher levels={[0, 1, 2]} choice={0} target={0} shown={2} onChange={() => {}} />
    </div>
  ),
  // A territory converted before LOD generation landed — one level, nothing to switch.
  single: (
    <div className="rounded-card border border-line bg-panel p-6">
      <LodSwitcher levels={[0]} choice={0} target={0} shown={0} onChange={() => {}} />
    </div>
  ),
  // Auto, framed whole: the coarse level is what Auto wanted, and it is on screen.
  auto: (
    <div className="rounded-card border border-line bg-panel p-6">
      <LodSwitcher levels={[0, 1, 2]} choice="auto" target={2} shown={2} onChange={() => {}} />
    </div>
  ),
  // Auto after a zoom: LOD 0 downloads behind the LOD 2 on screen.
  autoLoading: (
    <div className="rounded-card border border-line bg-panel p-6">
      <LodSwitcher levels={[0, 1, 2]} choice="auto" target={0} shown={2} onChange={() => {}} />
    </div>
  ),
};
