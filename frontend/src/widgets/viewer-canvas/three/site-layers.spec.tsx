import ReactThreeTestRenderer from "@react-three/test-renderer";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import type { Zone } from "@/entities/zone";
import type { SiteProps } from "../ui/props";
import SiteLayers from "./site-layers";

const ZONE: Zone = {
  id: 1,
  title: "Tank row",
  corners: [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 0, z: 1 },
    { x: 0, y: 0, z: 1 },
  ],
  tags: [],
  drawingWidthM: null,
  drawingHeightM: null,
  createdAt: "",
  updatedAt: "",
};
const site = (over: Partial<SiteProps> = {}): SiteProps => ({
  zones: [ZONE],
  showZones: true,
  selectedZoneId: null,
  onSelectZone: vi.fn(),
  preview: null,
  onGround: vi.fn(),
  ...over,
});

const territory = () => {
  const g = new Group();
  g.add(new Mesh(new BoxGeometry(4, 1, 4), new MeshBasicMaterial()));
  g.updateMatrixWorld(true);
  return g;
};

async function mount(over: Partial<SiteProps> = {}, hidden = false) {
  const props = site(over);
  const r = await ReactThreeTestRenderer.create(
    <SiteLayers
      site={props}
      interactive
      hidden={hidden}
      unitRatio={10}
      color="#f97316"
      territoryRef={{ current: territory() }}
    />,
  );
  await ReactThreeTestRenderer.act(() => r.advanceFrames(2, 0.016));
  const named = (name: string) => r.scene.findAll((n) => n.instance.name === name);
  return { r, props, named };
}

describe("SiteLayers", () => {
  it("draws the zones with no plan session and no plan layer", async () => {
    const { named } = await mount();
    expect(named("ZonesLayer")).toHaveLength(1);
    expect(named("PlanOverlay")).toHaveLength(0);
  });

  it("draws the candidate squares whether or not the saved zones are shown, and not inside a panorama", async () => {
    const preview = {
      outlines: [{ index: 0, corners: ZONE.corners as never }],
      selected: null,
      label: null,
      onSelect: vi.fn(),
    };
    const shown = await mount({ preview, showZones: false });
    expect(shown.named("PlanPreviewLayer")).toHaveLength(1);
    expect(shown.named("ZonesLayer")).toHaveLength(0);
    const inside = await mount({ preview }, true);
    expect(inside.named("PlanPreviewLayer")).toHaveLength(0);
  });

  it("draws no candidate squares without a preview", async () => {
    const { named } = await mount();
    expect(named("PlanPreviewLayer")).toHaveLength(0);
  });

  it("hands the page the ground", async () => {
    const { props } = await mount();
    expect(props.onGround).toHaveBeenCalledOnce();
    expect(vi.mocked(props.onGround).mock.calls[0][0].fallbackY).toBeCloseTo(0.5, 10);
  });

  it("draws no zones inside a panorama", async () => {
    const { named } = await mount({}, true);
    expect(named("ZonesLayer")).toHaveLength(0);
  });

  it("draws no zones when they are switched off", async () => {
    const { named } = await mount({ showZones: false });
    expect(named("ZonesLayer")).toHaveLength(0);
  });
});
