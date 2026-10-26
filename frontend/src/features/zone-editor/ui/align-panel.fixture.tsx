import type { ZoneEditor } from "../model/use-zone-editor";
import { alignmentStub } from "./alignment.fixture";
import { AlignPanel } from "./align-panel";

const editor = (a: Parameters<typeof alignmentStub>[0], over: Partial<ZoneEditor> = {}) =>
  ({ status: "ready", page: 1, pageCount: 1, setPage: () => {}, alignment: alignmentStub(a), ...over }) as ZoneEditor;

const PAIR = { pdf: { x: 0, y: 0 }, scene: { x: 0, y: 0, z: 0 }, utm: null };
const frame = (node: React.ReactNode) => <div className="w-[340px] p-6">{node}</div>;

export default {
  "automatic, four pairs": frame(
    <AlignPanel
      editor={editor({
        pairs: [PAIR, PAIR, PAIR, PAIR],
        residualsM: [0.31, 0.12, 0.58, 0.4],
        scaleLine: "Model is 1.2 % larger than the drawing",
        canSave: true,
      })}
    />,
  ),
  "two pairs, exact": frame(
    <AlignPanel
      editor={editor(
        { pairs: [PAIR, PAIR], residualsM: [0, 0], fitLine: "Exact fit with two points", canSave: true },
        { pageCount: 3, page: 2 },
      )}
    />,
  ),
  "manual, off the model": frame(
    <AlignPanel
      editor={editor({
        notice: "This plan's coordinates do not fall on this model",
        awaitingScenePick: true,
        pending: { x: 4, y: 4 },
      })}
    />,
  ),
  mirrored: frame(
    <AlignPanel
      editor={editor({
        pairs: [PAIR, PAIR, PAIR],
        error:
          "These points are mirrored relative to the model. Check that each point on the plan is matched to the same spot on the model; the model expects x east and z south.",
        fit: { ok: false, reason: "mirrored", message: "mirrored" },
      })}
    />,
  ),
  "scale off by more than 3 %": frame(
    <AlignPanel
      editor={editor({
        pairs: [PAIR, PAIR, PAIR],
        residualsM: [1.2, 0.9, 1.6],
        scaleLine: "Model is 4.0 % larger than the drawing. Check that the points match.",
        scaleWarn: true,
        canSave: true,
      })}
    />,
  ),
};
