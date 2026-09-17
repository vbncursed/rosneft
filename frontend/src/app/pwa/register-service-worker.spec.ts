import { describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./register-service-worker";

const fakeNavigator = (register: () => Promise<unknown>) =>
  ({ serviceWorker: { register: vi.fn(register) } }) as unknown as Navigator;

describe("registerServiceWorker", () => {
  it("registers /sw.js once the page has loaded, not before", () => {
    const nav = fakeNavigator(() => Promise.resolve({}));
    const win = new EventTarget() as Window;

    registerServiceWorker(nav, win);
    expect(nav.serviceWorker.register).not.toHaveBeenCalled();

    win.dispatchEvent(new Event("load"));
    expect(nav.serviceWorker.register).toHaveBeenCalledWith("/sw.js");
  });

  it("does nothing where the browser has no service worker support", () => {
    const win = new EventTarget() as Window;
    const listen = vi.spyOn(win, "addEventListener");

    registerServiceWorker({} as Navigator, win);

    expect(listen).not.toHaveBeenCalled();
  });

  // The desktop shell answers /sw.js with 404, and plain HTTP or a private
  // window refuses registration: the app must run on as a plain site.
  it("swallows a refused registration", () => {
    const refused = Promise.reject(new Error("404"));
    const handle = vi.spyOn(refused, "catch");
    const nav = fakeNavigator(() => refused);
    const win = new EventTarget() as Window;

    registerServiceWorker(nav, win);
    win.dispatchEvent(new Event("load"));

    expect(handle).toHaveBeenCalledOnce();
  });
});
