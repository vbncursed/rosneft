/** Counting semaphore whose waiters can be aborted. */
export class Semaphore {
  private readonly waiting: (() => void)[] = [];

  constructor(private free: number) {}

  /** Rejects on abort without taking a slot: a cancelled queued save must not wait for one. */
  acquire(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (this.free > 0) {
      this.free -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const turn = () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = () => {
        this.waiting.splice(this.waiting.indexOf(turn), 1);
        reject(signal.reason);
      };
      this.waiting.push(turn);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.free += 1;
  }
}
