// Test-only harness for driving hooks under vitest/jsdom.
//
// ponytail: 15 lines over a @testing-library/react dependency — React 19
// exports `act` itself and react-dom/client is already here. Swap in the
// real thing if these suites start needing queries, events or cleanup
// semantics beyond render/rerender/unmount.
import { act } from "react";
import { createRoot } from "react-dom/client";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export interface HookHandle<T> {
  result: { current: T };
  rerender: () => void;
  unmount: () => void;
}

export function renderHook<T>(useHook: () => T): HookHandle<T> {
  const result = { current: undefined as T };
  function Probe() {
    result.current = useHook();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const render = () => act(() => root.render(<Probe />));
  render();
  return { result, rerender: render, unmount: () => act(() => root.unmount()) };
}

// act re-exported so suites can flush state updates they trigger themselves.
export { act };
