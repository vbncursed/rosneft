import { ArtifactRow } from "./artifact-row";

export default (
  <div className="flex max-w-[360px] flex-col gap-2 p-6">
    <ArtifactRow tag="LOD 0" file="valve-assembly-lod0.glb" meta="18 412 tris · full detail" size="9.8 MB" href="#" />
    <ArtifactRow tag="LOD 1" file="valve-assembly-lod1.glb" meta="6 140 tris · mid range" size="2.1 MB" href="#" />
    <ArtifactRow
      tag="LOD 2"
      file="a-much-longer-model-name-than-fits-in-the-column-lod2.glb"
      meta="1 320 tris · far range"
      size="412 KB"
    />
  </div>
);
