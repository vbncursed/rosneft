import { KeycapHint } from "./keycap-hint";

export default {
  // Mock state 1 — the viewport's bottom-right hint row.
  pair: (
    <div className="flex gap-1.5 rounded-card border border-line bg-panel p-6">
      <KeycapHint keyLabel="M">measure</KeycapHint>
      <KeycapHint keyLabel="Esc">exit / deselect</KeycapHint>
    </div>
  ),
};
