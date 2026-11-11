import { BufferAttribute, BufferGeometry, Matrix4, Mesh, MeshBasicMaterial } from "three";
import { matchImages, spreadMatches } from "@/shared/lib/image-registration";
import type { RegistrationGeometry } from "./registration-geometry";
import { pointsOnTexture } from "./texture-surface";

type GrayImage = { data: Uint8Array; width: number; height: number };
export type RegistrationRequest = { source: GrayImage; target: GrayImage; geometry: RegistrationGeometry };

self.onmessage = (event: MessageEvent<RegistrationRequest>) => {
  try {
    const { source, target, geometry: snapshot } = event.data;
    const matches = spreadMatches(matchImages(source, target), source);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(snapshot.positions, 3));
    geometry.setAttribute("uv", new BufferAttribute(snapshot.uvs, 2));
    if (snapshot.indices) geometry.setIndex(new BufferAttribute(snapshot.indices, 1));
    const material = new MeshBasicMaterial();
    const mesh = new Mesh(geometry, material);
    mesh.matrixWorld.copy(new Matrix4().fromArray(snapshot.matrix));
    const points = pointsOnTexture(
      mesh,
      matches.map((m) => ({
        x: (m.target.x + 0.5) / target.width,
        y: 1 - (m.target.y + 0.5) / target.height,
      })),
    );
    geometry.dispose();
    material.dispose();
    self.postMessage({ matches, points });
  } catch {
    self.postMessage({ matches: [], points: [] });
  }
};
