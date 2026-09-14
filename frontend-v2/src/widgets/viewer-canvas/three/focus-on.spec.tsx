import ReactThreeTestRenderer from "@react-three/test-renderer";
import { createRef } from "react";
import { BoxGeometry, Group, Mesh } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FocusOn from "./focus-on";
import { boundsStub } from "./testing";

vi.mock("@react-three/drei", async (orig) => (await import("./testing")).mockDrei(orig));

const unitCube = (id: number, x: number) => {
  const g = new Group();
  g.userData.placementId = id;
  g.position.x = x;
  g.add(new Mesh(new BoxGeometry(1, 1, 1)));
  return g;
};

/**
 * The shape the real canvas builds:
 *
 *   scene
 *   └── wrapper                 ← what FocusOn is handed
 *       ├── Bounds group        ← drei renders one of its own
 *       │   └── territory
 *       └── placement instances ← siblings of the Bounds group, not of the territory
 *
 * `stray` stands for anything else hanging off the canvas root; the frame must
 * come from the wrapper's own subtree and never from a walk up to its parent.
 */
function scene() {
  const root = new Group();
  const wrapper = new Group();
  const bounds = new Group();
  bounds.name = "Bounds";
  bounds.add(new Group());
  wrapper.add(bounds, unitCube(3, 10), unitCube(4, -10));
  root.add(wrapper, unitCube(3, 100));
  return wrapper;
}

const refTo = (g: Group) => {
  const ref = createRef<Group>();
  ref.current = g;
  return ref;
};

beforeEach(() => {
  boundsStub.refresh.mockClear();
  boundsStub.fit.mockClear();
});

describe("FocusOn", () => {
  it("frames the requested instance wherever it sits under the wrapper", async () => {
    await ReactThreeTestRenderer.create(<FocusOn root={refTo(scene())} request={[3]} />);
    const box = boundsStub.refresh.mock.calls[0][0];
    expect(box.min.x).toBeCloseTo(9.5);
    expect(box.max.x).toBeCloseTo(10.5);
    expect(boundsStub.fit).toHaveBeenCalledTimes(1);
  });

  it("unions several instances into one frame", async () => {
    await ReactThreeTestRenderer.create(<FocusOn root={refTo(scene())} request={[3, 4]} />);
    const box = boundsStub.refresh.mock.calls[0][0];
    expect(box.min.x).toBeCloseTo(-10.5);
    expect(box.max.x).toBeCloseTo(10.5);
  });

  it("does nothing without a request", async () => {
    await ReactThreeTestRenderer.create(<FocusOn root={refTo(scene())} request={null} />);
    expect(boundsStub.refresh).not.toHaveBeenCalled();
  });

  it("does nothing when the request names nothing in the scene", async () => {
    await ReactThreeTestRenderer.create(<FocusOn root={refTo(scene())} request={[99]} />);
    expect(boundsStub.refresh).not.toHaveBeenCalled();
  });

  it("does nothing before the wrapper group has mounted", async () => {
    await ReactThreeTestRenderer.create(<FocusOn root={createRef<Group>()} request={[3]} />);
    expect(boundsStub.refresh).not.toHaveBeenCalled();
  });

  it("refits on a new request, not on the same array reference", async () => {
    const ref = refTo(scene());
    const request = [3];
    const r = await ReactThreeTestRenderer.create(<FocusOn root={ref} request={request} />);
    await r.update(<FocusOn root={ref} request={request} />);
    expect(boundsStub.fit).toHaveBeenCalledTimes(1);
    await r.update(<FocusOn root={ref} request={[3]} />);
    expect(boundsStub.fit).toHaveBeenCalledTimes(2);
  });

  it("frames a placement that mounted under the same wrapper, through the real tree", async () => {
    // The regression this file exists for: mounted for real, the territory's
    // parent is the Bounds group, so a frame resolved from the territory's
    // parent can never see a placement.
    const wrapperRef = createRef<Group>();
    await ReactThreeTestRenderer.create(
      <>
        <group ref={wrapperRef}>
          <group name="Bounds">
            <group />
            <FocusOn root={wrapperRef} request={[7]} />
          </group>
          <group userData={{ placementId: 7 }} position={[4, 0, 0]}>
            <mesh>
              <boxGeometry args={[1, 1, 1]} />
            </mesh>
          </group>
        </group>
        {/* Outside the wrapper, the way the measurement layer and the grid are. */}
        <group userData={{ placementId: 7 }} position={[80, 0, 0]}>
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
          </mesh>
        </group>
      </>,
    );
    expect(boundsStub.refresh).toHaveBeenCalledTimes(1);
    expect(boundsStub.refresh.mock.calls[0][0].max.x).toBeCloseTo(4.5);
  });
});
