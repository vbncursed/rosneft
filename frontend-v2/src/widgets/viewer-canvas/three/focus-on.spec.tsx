import ReactThreeTestRenderer from "@react-three/test-renderer";
import { createRef } from "react";
import { Box3, BoxGeometry, Group, Mesh } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FocusOn from "./focus-on";
import { boundsStub } from "./testing";

vi.mock("@react-three/drei", async (orig) => (await import("./testing")).mockDrei(orig));

function wrapper() {
  const root = new Group();
  const territory = new Group();
  const instance = new Group();
  instance.userData.placementId = 3;
  instance.add(new Mesh(new BoxGeometry(1, 1, 1)));
  root.add(territory, instance);
  return territory;
}

beforeEach(() => {
  boundsStub.refresh.mockClear();
  boundsStub.fit.mockClear();
});

describe("FocusOn", () => {
  it("frames the requested instances, which are the territory's siblings", async () => {
    const ref = createRef<Group>();
    ref.current = wrapper();
    await ReactThreeTestRenderer.create(<FocusOn root={ref} request={[3]} />);
    expect(boundsStub.refresh).toHaveBeenCalledWith(expect.any(Box3));
    expect(boundsStub.fit).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a request", async () => {
    const ref = createRef<Group>();
    ref.current = wrapper();
    await ReactThreeTestRenderer.create(<FocusOn root={ref} request={null} />);
    expect(boundsStub.refresh).not.toHaveBeenCalled();
  });

  it("does nothing when the request names nothing in the scene", async () => {
    const ref = createRef<Group>();
    ref.current = wrapper();
    await ReactThreeTestRenderer.create(<FocusOn root={ref} request={[99]} />);
    expect(boundsStub.refresh).not.toHaveBeenCalled();
  });

  it("does nothing before the territory group has mounted", async () => {
    await ReactThreeTestRenderer.create(<FocusOn root={createRef<Group>()} request={[3]} />);
    expect(boundsStub.refresh).not.toHaveBeenCalled();
  });

  it("refits on a new request, not on the same array reference", async () => {
    const ref = createRef<Group>();
    ref.current = wrapper();
    const request = [3];
    const r = await ReactThreeTestRenderer.create(<FocusOn root={ref} request={request} />);
    await r.update(<FocusOn root={ref} request={request} />);
    expect(boundsStub.fit).toHaveBeenCalledTimes(1);
    await r.update(<FocusOn root={ref} request={[3]} />);
    expect(boundsStub.fit).toHaveBeenCalledTimes(2);
  });
});
