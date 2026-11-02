import { ZONE } from "./zone-options.fixture";
import { ZonePanel } from "./zone-panel";

const noop = () => undefined;
const frame = (node: React.ReactNode) => <div className="w-[320px] p-6">{node}</div>;
const base = { zone: ZONE, inside: 3, onAddObjects: noop, onClose: noop };
const SIZE = { text: "Drawing 10.0 × 5.0 m · Model 10.0 × 5.0 m (0 %)", warn: false };

export default {
  filled: frame(<ZonePanel {...base} sizeLine={SIZE} onEdit={noop} onDelete={noop} />),
  "size differs": frame(
    <ZonePanel
      {...base}
      sizeLine={{
        text: "Drawing 10.0 × 5.0 m · Model 11.4 × 5.0 m (+14 %) · differs from the drawing by more than 3 %",
        warn: true,
      }}
    />,
  ),
  empty: frame(<ZonePanel {...base} inside={0} sizeLine={null} />),
  "read-only": frame(<ZonePanel {...base} onAddObjects={undefined} sizeLine={SIZE} />),
};
