import { readFileSync } from "node:fs";
import { atomicWrite } from "./atomic-write";
import { DEFAULT_LIMIT, isLimit, isUserId } from "./validate";

export type Settings = { userId: string | null; limit: number; dismissedUpdate: string | null };

function load(file: string): Settings {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<Settings>;
    const dismissed = typeof raw.dismissedUpdate === "string" && /^\d+\.\d+\.\d+$/u.test(raw.dismissedUpdate);
    return {
      userId: isUserId(raw.userId) ? raw.userId : null,
      limit: isLimit(raw.limit) ? raw.limit : DEFAULT_LIMIT,
      dismissedUpdate: dismissed ? raw.dismissedUpdate! : null,
    };
  } catch {
    return { userId: null, limit: DEFAULT_LIMIT, dismissedUpdate: null };
  }
}

/**
 * The shell's own state: whose cache is current (so a launch with no network
 * still knows which /api/auth/me snapshot to answer with) and the disk limit.
 * Writes are chained so two quick updates land in order.
 */
export class SettingsFile {
  value: Settings;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {
    this.value = load(file);
  }

  update(patch: Partial<Settings>): Promise<void> {
    this.value = { ...this.value, ...patch };
    const snapshot = JSON.stringify(this.value);
    this.chain = this.chain
      .then(() => atomicWrite(this.file, snapshot))
      .catch((err: unknown) => console.error("settings: write failed", err));
    return this.chain;
  }
}
