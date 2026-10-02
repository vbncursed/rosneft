import { openableExternally } from "./links";
import type { Settings } from "./settings";

const RELEASES_URL = "https://api.github.com/repos/vbncursed/rosneft/releases?per_page=20";
const TAG = /^desktop-v(\d+)\.(\d+)\.(\d+)$/u;

type Triple = [number, number, number];
const parse = (v: string): Triple | null => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/u.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const greater = (a: Triple, b: Triple) => (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) > 0;

export function newerRelease(current: string, releases: unknown): { version: string; url: string } | null {
  const cur = parse(current);
  if (!cur || !Array.isArray(releases)) return null;
  let best: { version: string; url: string; triple: Triple } | null = null;
  for (const r of releases as Record<string, unknown>[]) {
    if (!r || typeof r !== "object" || r.draft !== false || r.prerelease !== false) continue;
    if (typeof r.tag_name !== "string" || typeof r.html_url !== "string") continue;
    const m = TAG.exec(r.tag_name);
    if (!m) continue;
    const triple: Triple = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (greater(triple, best?.triple ?? cur)) best = { version: m.slice(1).join("."), url: r.html_url, triple };
  }
  return best && { version: best.version, url: best.url };
}

export type UpdateDeps = {
  fetch: (url: string, init: { headers: Record<string, string> }) => Promise<Response>;
  settings: { value: Pick<Settings, "dismissedUpdate">; update: (patch: Partial<Settings>) => Promise<void> };
  /** Resolves to the index of the pressed button: 0 Download, 1 Later. */
  showDialog: (message: string, detail: string) => Promise<number>;
  openExternal: (url: string) => Promise<void>;
  currentVersion: string;
};

let open = false;

export async function checkForUpdates(deps: UpdateDeps): Promise<void> {
  if (open) return;
  open = true;
  try {
    const res = await deps.fetch(RELEASES_URL, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return;
    const found = newerRelease(deps.currentVersion, await res.json());
    if (!found || deps.settings.value.dismissedUpdate === found.version) return;
    const pressed = await deps.showDialog(
      `Andrey Desktop v${found.version} is available`,
      `You have v${deps.currentVersion}.`,
    );
    if (pressed === 0) {
      if (openableExternally(found.url) && new URL(found.url).hostname === "github.com")
        await deps.openExternal(found.url);
    } else {
      await deps.settings.update({ dismissedUpdate: found.version });
    }
  } catch (err) {
    console.warn("update check failed", err);
  } finally {
    open = false;
  }
}
