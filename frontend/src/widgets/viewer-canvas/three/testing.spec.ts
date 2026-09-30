import { Html } from "@react-three/drei";
import { screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import {
  boundsStub,
  createInPage,
  eventually,
  fakeControls,
  fakePlacement,
  fakeScene,
  mockDrei,
  unmountInPage,
} from "./testing";

describe("the drei test doubles", () => {
  it("builds a parsable scene and a one-level placement", () => {
    expect(fakeScene().children).toHaveLength(1);
    expect(fakePlacement(3).chain[0].hash).toBe("h3");
    expect(fakePlacement(3).position.x).toBe(3);
  });

  it("replaces the network- and DOM-bound pieces and keeps the rest", async () => {
    const drei = await mockDrei(async () => ({ Grid: "kept", useGLTF: "real" }));
    expect((drei as unknown as Record<string, unknown>).Grid).toBe("kept");
    expect(drei.useGLTF()).toEqual({ scene: expect.anything() });
    expect(drei.useGLTF.preload).toBeTypeOf("function");
    expect(drei.useBounds()).toBe(boundsStub);
  });

  it("fires a controls listener until it is removed again", () => {
    const controls = fakeControls();
    let fired = 0;
    const listener = () => (fired += 1);
    controls.addEventListener("change", listener);
    controls.fire("change");
    controls.fire("other");
    expect(fired).toBe(1);

    controls.removeEventListener("change", listener);
    controls.fire("change");
    expect(fired).toBe(1);
  });

  it("retries a check until it passes, and gives up with its error", async () => {
    const ready = Date.now() + 30;
    await eventually(() => expect(Date.now()).toBeGreaterThan(ready));
    await expect(eventually(() => expect(1).toBe(2), 30)).rejects.toThrow("expected 1 to be 2");
  });

  it("puts the canvas in the page, where drei's Html mounts its DOM, and takes both away again", async () => {
    const r = await createInPage(
      createElement("group", { name: "anchor" }, createElement(Html, null, createElement("span", null, "label"))),
    );
    expect(r.scene.findByProps({ name: "anchor" })).toBeDefined();
    expect(document.querySelector("canvas")?.isConnected).toBe(true);
    expect(screen.getByText("label")).toBeInTheDocument();

    await unmountInPage();
    expect(screen.queryByText("label")).toBeNull();
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("takes its own canvas out of the page when unmounted, and leaves the others", async () => {
    const first = await createInPage(createElement("group"));
    await createInPage(createElement("group"));
    expect(document.querySelectorAll("canvas")).toHaveLength(2);

    await first.unmount();
    expect(document.querySelectorAll("canvas")).toHaveLength(1);

    await unmountInPage();
    expect(document.querySelectorAll("canvas")).toHaveLength(0);
  });
});
