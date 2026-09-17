import { Icon } from "./icon";
import { ICON_NAMES } from "./glyphs";

export default (
  <div className="grid grid-cols-3 gap-3 p-6 sm:grid-cols-5 lg:grid-cols-9">
    {ICON_NAMES.map((name) => (
      <div
        key={name}
        className="flex flex-col items-center gap-2 rounded-[10px] border border-line bg-panel-2 px-2 py-3.5 text-fg"
      >
        <Icon name={name} />
        <span className="font-mono text-[9px] text-muted">{name}</span>
      </div>
    ))}
  </div>
);
