import ReactThreeTestRenderer from "@react-three/test-renderer";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import type { Zone } from "@/entities/zone";
import type { SiteProps } from "../ui/props";
import SiteLayers from "./site-layers";

const image = { width: 10, height: 10, close: () => {} } as unknown as ImageBitmap;
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
const PLAN = {
  image,
  fit: { similarity: { scale: 1, rotation: 0, tx: 0, tz: 0 }, page: { width: 2, height: 2 } },
};

const site = (over: Partial<SiteProps> = {}): SiteProps => ({
  zones: [ZONE],
  showZones: true,
  selectedZoneId: null,
  onSelectZone: vi.fn(),
  plan: PLAN,
  planOpacity: 1,
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
  it("draws the zones and, once the ground is known, the plan at its median height", async () => {
    const { named } = await mount();
    expect(named("ZonesLayer")).toHaveLength(1);
    const plan = named("PlanOverlay");
    expect(plan).toHaveLength(1);
    // The box's top is 0.5 above its centre.
    expect((plan[0].instance as Mesh).geometry.getAttribute("position").getY(0)).toBeCloseTo(0.5, 10);
  });

  it("hands the page the ground", async () => {
    const { props } = await mount();
    expect(props.onGround).toHaveBeenCalledOnce();
    expect(vi.mocked(props.onGround).mock.calls[0][0].fallbackY).toBeCloseTo(0.5, 10);
  });

  it("draws neither layer inside a panorama", async () => {
    const { named } = await mount({}, true);
    expect(named("ZonesLayer")).toHaveLength(0);
    expect(named("PlanOverlay")).toHaveLength(0);
  });

  it("draws no zones when they are switched off, and no plan when there is none", async () => {
    const { named } = await mount({ showZones: false, plan: null });
    expect(named("ZonesLayer")).toHaveLength(0);
    expect(named("PlanOverlay")).toHaveLength(0);
  });
});
