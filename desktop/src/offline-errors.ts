import type { Progress, SaveError } from "./ipc-contract";

export class SaveFailure extends Error {
  constructor(readonly reason: SaveError) {
    super(reason);
  }
}

/** The server no longer knows the territory (404). Only a resync of a synced copy acts on it. */
export class Gone extends Error {}

/** The signed-in user is no longer the one this save started for. */
export class SessionChanged extends Error {}

export function reasonOf(err: unknown): SaveError {
  if (err instanceof SaveFailure) return err.reason;
  if ((err as { code?: unknown })?.code === "ENOSPC") return "no-space";
  if (String((err as { message?: unknown })?.message).includes("net::ERR")) return "network";
  return "failed";
}

export function throttled(emit: (p: Progress) => void, ms: number) {
  let last = 0;
  return (p: Progress) => {
    const now = Date.now();
    if (now - last < ms) return;
    last = now;
    emit(p);
  };
}

export function checked(res: Response): Response {
  if (res.status === 401) throw new SaveFailure("signed-out");
  if (res.status !== 200) throw new SaveFailure("failed");
  return res;
}
