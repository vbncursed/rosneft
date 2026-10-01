import { readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { DEFAULT_LIMIT, isLimit, isUserId } from "./validate";

export type Settings = { userId: string | null; limit: number };

function load(file: string): Settings {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<Settings>;
    return { userId: isUserId(raw.userId) ? raw.userId : null, limit: isLimit(raw.limit) ? raw.limit : DEFAULT_LIMIT };
  } catch {
    return { userId: null, limit: DEFAULT_LIMIT };
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
      .then(async () => {
        await writeFile(`${this.file}.tmp`, snapshot);
        await rename(`${this.file}.tmp`, this.file);
      })
      .catch((err: unknown) => console.error("settings: write failed", err));
    return this.chain;
  }
}
