import { describe, expect, it, vi } from "vitest";
import { Texture, Vector4, type WebGLRenderer } from "three";
import { readRegistrationTexture } from "./registration-readback";

describe("readRegistrationTexture", () => {
  it("restores renderer state after reading the texture", () => {
    const previous = {};
    const renderer = {
      xr: { enabled: true },
      autoClear: false,
      getRenderTarget: () => previous,
      getViewport: (v: Vector4) => v.set(1, 2, 3, 4),
      getScissor: (v: Vector4) => v.set(5, 6, 7, 8),
      getScissorTest: () => true,
      setRenderTarget: vi.fn(),
      setViewport: vi.fn(),
      setScissor: vi.fn(),
      setScissorTest: vi.fn(),
      render: vi.fn(),
      readRenderTargetPixels: vi.fn((_target, _x, _y, _w, _h, pixels: Uint8Array) => pixels.fill(255)),
    };
    const texture = new Texture();
    texture.image = { width: 2, height: 2 };
    expect(readRegistrationTexture(renderer as unknown as WebGLRenderer, texture)?.data).toEqual(
      new Uint8Array([255, 255, 255, 255]),
    );
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(previous);
    expect(renderer.xr.enabled).toBe(true);
    expect(renderer.autoClear).toBe(false);
  });
});
