import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSettleBus, SETTLE_MS } from "./settle-bus";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createSettleBus", () => {
  it("measures every watcher once, SETTLE_MS after the last settle", () => {
    const bus = createSettleBus();
    const a = vi.fn(() => true);
    const b = vi.fn(() => true);
    bus.watch(a);
    bus.watch(b);
    bus.settle();
    vi.advanceTimersByTime(SETTLE_MS - 1);
    expect(a).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("measures a watcher that joins a still scene", () => {
    const bus = createSettleBus();
    const late = vi.fn(() => true);
    bus.watch(late);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("retries on each frame only what had nothing to measure, until it measures", () => {
    const bus = createSettleBus();
    let ready = false;
    const owed = vi.fn(() => ready);
    const done = vi.fn(() => true);
    bus.watch(owed);
    bus.watch(done);
    vi.advanceTimersByTime(SETTLE_MS);
    bus.frame();
    expect(owed).toHaveBeenCalledTimes(2);
    expect(done).toHaveBeenCalledTimes(1);
    ready = true;
    bus.frame();
    bus.frame();
    expect(owed).toHaveBeenCalledTimes(3);
  });

  it("drops the retries when the camera moves again — never measure mid-gesture", () => {
    const bus = createSettleBus();
    const owed = vi.fn(() => false);
    bus.watch(owed);
    vi.advanceTimersByTime(SETTLE_MS);
    bus.settle();
    bus.frame();
    expect(owed).toHaveBeenCalledTimes(1);
  });

  it("forgets an unwatched measure, owed or not", () => {
    const bus = createSettleBus();
    const owed = vi.fn(() => false);
    const unwatch = bus.watch(owed);
    vi.advanceTimersByTime(SETTLE_MS);
    unwatch();
    bus.frame();
    bus.settle();
    vi.advanceTimersByTime(SETTLE_MS);
    expect(owed).toHaveBeenCalledTimes(1);
  });

  it("stop cancels a pending settle", () => {
    const bus = createSettleBus();
    const m = vi.fn(() => true);
    bus.watch(m);
    bus.stop();
    vi.advanceTimersByTime(SETTLE_MS);
    expect(m).not.toHaveBeenCalled();
  });
});
