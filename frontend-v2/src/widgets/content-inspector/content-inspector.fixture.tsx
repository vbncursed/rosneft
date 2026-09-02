import { ContentInspector } from "./ui/content-inspector";
import type { ContentItem } from "@/entities/content";

const noop = () => {};

const converting: ContentItem = {
  kind: "territory",
  slug: "terminal-yard-4",
  title: "Terminal Yard 4",
  status: "converting",
  meta: "terminal-yard-4 · job 8f21",
  lods: "LOD 0-1",
  size: "760 MB",
  progress: 62,
};

const DETAILS = [
  { label: "source", value: "terminal-yard-4.obj · 2.4 GB" },
  { label: "artifacts", value: "GLB + KTX2 · 760 MB" },
  {
    label: "lods",
    value: (
      <>
        0-1 <span className="text-warn">(2 pending)</span>
      </>
    ),
  },
  { label: "job", value: "8f21 · mesh-worker-2" },
];

export default {
  converting: (
    <div className="max-w-sm p-6">
      <ContentInspector
        item={converting}
        details={DETAILS}
        conversionNote="62% · ~4 min"
        stages={[
          { label: "Parsing OBJ", state: "done", time: "1m 12s" },
          { label: "Building LOD 0-1", state: "done", time: "3m 04s" },
          { label: "Compressing textures", state: "active", time: "running" },
          { label: "Building LOD 2", state: "pending", time: "queued" },
        ]}
        onClose={noop}
        onReplaceSource={noop}
        onOpenInViewer={noop}
        onDelete={noop}
        onCancelJob={noop}
      />
    </div>
  ),
  ready: (
    <div className="max-w-sm p-6">
      <ContentInspector
        item={{ ...converting, slug: "north-ridge-pad", title: "North Ridge Pad", status: "ready", lods: "LOD 0-2", size: "412 MB", progress: undefined }}
        details={[
          { label: "source", value: "north-ridge-pad.obj · 1.1 GB" },
          { label: "artifacts", value: "GLB + KTX2 · 412 MB" },
        ]}
        onClose={noop}
        onReplaceSource={noop}
        onOpenInViewer={noop}
        onDelete={noop}
      />
    </div>
  ),
};
