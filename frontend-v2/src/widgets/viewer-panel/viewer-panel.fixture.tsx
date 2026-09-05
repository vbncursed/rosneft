import { ViewerPanel } from "./ui/viewer-panel";

const back = { label: "← Catalog", href: "#" };
const metadata = { vertices: 4812330, faces: 1604110, dimensions: { x: 182, y: 44, z: 96 } };

export default (
  <div className="p-6 grid max-w-2xl gap-4 md:grid-cols-2">
    <ViewerPanel title="Refinery Block C" back={back} metadata={metadata} />
    <ViewerPanel
      title="Refinery Block C"
      back={back}
      metadata={metadata}
      toolHint="Click to extend · click the start dot to close the loop · Esc breaks the chain."
    />
  </div>
);
