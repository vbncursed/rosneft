import { offlineView } from "../model/offline-view";
import { OfflineControl } from "./offline-toggle";

const SAVED = { slug: "a", title: "Ust-Kut", bytes: 1288490189, savedAt: "t", syncedAt: "t" };
const progress = (over: object) => ({ slug: "a", state: "saving" as const, done: 0, total: 0, ...over });

const views = {
  idle: offlineView(),
  saving: offlineView(undefined, progress({ done: 42, total: 100 })),
  saved: offlineView(SAVED),
  failed: offlineView(undefined, progress({ state: "failed", error: "no-space" })),
};

const noop = () => {};

// The real control, one state each, with no shell behind it.
export default {
  ...Object.fromEntries(
    Object.entries(views).map(([name, view]) => [name, <div key={name} className="p-6"><OfflineControl view={view} title="Ust-Kut" onAct={noop} /></div>]),
  ),
  "compact idle": <div className="p-6"><OfflineControl view={views.idle} title="Ust-Kut" onAct={noop} compact /></div>,
  "compact saved": <div className="p-6"><OfflineControl view={views.saved} title="Ust-Kut" onAct={noop} compact /></div>,
};
