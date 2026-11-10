import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector4,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from "three";
import { grayscaleReadback } from "./registration-pixels";

/** Reads even GPU-compressed textures through a temporary render target. */
export function readRegistrationTexture(renderer: WebGLRenderer, texture: Texture) {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const originalWidth = image?.width ?? 0,
    originalHeight = image?.height ?? 0;
  if (!originalWidth || !originalHeight || originalWidth > 16384 || originalHeight > 16384) return null;
  const scale = Math.min(1, 2048 / Math.max(originalWidth, originalHeight));
  const width = Math.round(originalWidth * scale),
    height = Math.round(originalHeight * scale);
  const target = new WebGLRenderTarget(width, height, { depthBuffer: false, stencilBuffer: false });
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    uniforms: { map: { value: texture } },
    vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: "uniform sampler2D map; varying vec2 vUv; void main(){gl_FragColor=texture2D(map,vUv);}",
    depthTest: false,
    depthWrite: false,
  });
  const scene = new Scene();
  scene.add(new Mesh(geometry, material));
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const previous = renderer.getRenderTarget(),
    viewport = renderer.getViewport(new Vector4());
  const scissor = renderer.getScissor(new Vector4()),
    scissorTest = renderer.getScissorTest();
  const xr = renderer.xr.enabled,
    autoClear = renderer.autoClear;
  try {
    renderer.xr.enabled = false;
    renderer.autoClear = true;
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, width, height);
    renderer.setScissorTest(false);
    renderer.render(scene, camera);
    const rgba = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, rgba);
    return { width, height, data: grayscaleReadback(rgba, width, height) };
  } finally {
    renderer.setRenderTarget(previous);
    renderer.setViewport(viewport);
    renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest);
    renderer.xr.enabled = xr;
    renderer.autoClear = autoClear;
    material.dispose();
    geometry.dispose();
    target.dispose();
  }
}
