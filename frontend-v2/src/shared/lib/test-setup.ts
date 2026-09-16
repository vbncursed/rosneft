import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

// jsdom 30 still ships <dialog> without showModal/close. The components use the
// native element on purpose — it is what gives a real browser the focus trap and
// the inert background — so the tests get the smallest shim that models `open`
// and, like the browser, hands focus back to whatever held it before opening.
if (!HTMLDialogElement.prototype.showModal) {
  const openedFrom = new WeakMap<HTMLDialogElement, Element | null>();
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    openedFrom.set(this, document.activeElement);
    this.open = true;
  };
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    openedFrom.set(this, document.activeElement);
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, value?: string) {
    if (!this.open) return;
    this.open = false;
    if (value !== undefined) this.returnValue = value;
    const previous = openedFrom.get(this);
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
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
