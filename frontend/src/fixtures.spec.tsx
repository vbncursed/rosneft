import { act, render } from "@testing-library/react";
import { createElement, isValidElement, type ReactNode } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { preloadViewer } from "@/widgets/viewer-canvas";

/**
 * Every fixture must at least render. Cosmos only loads a fixture when someone
 * opens it, so a broken one sits there silently until a person clicks it — and
 * fixtures are exactly where undertested sample data lives.
 *
 * The glob is lazy on purpose: eager imports would throw while the file loads,
 * which fails the run without naming the fixture at fault.
 */
const modules = import.meta.glob("./**/*.fixture.tsx") as Record<string, () => Promise<{ default: unknown }>>;

/** Cosmos accepts an element, a component, or a named map of either. */
function nodesOf(exported: unknown): [string, ReactNode][] {
  if (isValidElement(exported)) return [["default", exported]];
  // createElement rather than JSX: these are built into an array, and the
  // jsx-key rule is right to flag that shape even though nothing lists them.
  if (typeof exported === "function") {
    return [["default", createElement(exported as () => ReactNode)]];
  }
  if (exported && typeof exported === "object") {
    return Object.entries(exported as Record<string, unknown>).flatMap(([name, value]) => {
      if (isValidElement(value)) return [[name, value] as [string, ReactNode]];
      if (typeof value === "function") {
        return [[name, createElement(value as () => ReactNode)] as [string, ReactNode]];
      }
      return [];
    });
  }
  return [];
}

const paths = Object.keys(modules).sort();

describe("every fixture renders", () => {
  // The viewer is the app's one code-split chunk. Fetched by the first fixture
  // that suspended on it, it arrived seconds later, long after that render's
  // act had closed, and woke every root still waiting on it in the middle of
  // some other test. Loaded up front, the lazy boundary resolves within a
  // microtask — inside the act each fixture now awaits, canvas and all.
  beforeAll(() => preloadViewer());

  it("finds the fixtures to check — a broken glob must not pass silently", () => {
    expect(paths.length).toBeGreaterThan(40);
  });

  it.each(paths)("%s", async (path) => {
    const module = await modules[path]();
    const nodes = nodesOf(module.default);
    expect(nodes.length, `${path} exports no renderable fixture`).toBeGreaterThan(0);

    for (const [name, node] of nodes) {
      await expect(
        act(async () => {
          render(<>{node}</>);
        }),
        `${path} › ${name} threw while rendering`,
      ).resolves.toBeUndefined();
    }
  });
});
