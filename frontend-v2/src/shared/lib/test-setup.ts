import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

// jsdom 30 still ships <dialog> without showModal/close. The components use the
// native element on purpose — it is what gives a real browser the focus trap and
// the inert background — so the tests get the smallest shim that models `open`.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, value?: string) {
    this.open = false;
    if (value !== undefined) this.returnValue = value;
    this.dispatchEvent(new Event("close"));
  };
}

// jsdom has no ResizeObserver, and react-three-fiber's <Canvas> refuses to
// mount without one. It used to go unnoticed: the viewer fixture wraps a lazy
// ViewerCanvas in <Suspense>, so a synchronous render only ever produced the
// fallback — until a second fixture in the same run had already resolved that
// chunk, at which point the real canvas mounted and threw. A no-op observer is
// enough: nothing in jsdom ever changes size.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
