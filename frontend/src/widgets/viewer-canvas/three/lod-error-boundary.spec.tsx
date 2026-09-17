import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import LodErrorBoundary from "./lod-error-boundary";

function Throwing({ boom }: { boom: boolean }) {
  if (boom) throw new Error("bad glb");
  return <p>level on screen</p>;
}

// React logs every caught error; the boundary catching it is the point.
let quiet: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  quiet = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => quiet.mockRestore());

describe("LodErrorBoundary", () => {
  it("renders the level while it loads", () => {
    render(
      <LodErrorBoundary resetKey="a" onError={vi.fn()}>
        <Throwing boom={false} />
      </LodErrorBoundary>,
    );
    expect(screen.getByText("level on screen")).toBeInTheDocument();
  });

  it("hands a thrown render to the caller and draws nothing", () => {
    const onError = vi.fn();
    render(
      <LodErrorBoundary resetKey="a" onError={onError}>
        <Throwing boom />
      </LodErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "bad glb" }));
    expect(screen.queryByText("level on screen")).not.toBeInTheDocument();
  });

  it("re-arms on a new resetKey so the recovered chain can mount again", () => {
    const { rerender } = render(
      <LodErrorBoundary resetKey="a" onError={vi.fn()}>
        <Throwing boom />
      </LodErrorBoundary>,
    );
    rerender(
      <LodErrorBoundary resetKey="b" onError={vi.fn()}>
        <Throwing boom={false} />
      </LodErrorBoundary>,
    );
    expect(screen.getByText("level on screen")).toBeInTheDocument();
  });

  it("stays down while the resetKey is unchanged", () => {
    const { rerender } = render(
      <LodErrorBoundary resetKey="a" onError={vi.fn()}>
        <Throwing boom />
      </LodErrorBoundary>,
    );
    rerender(
      <LodErrorBoundary resetKey="a" onError={vi.fn()}>
        <Throwing boom={false} />
      </LodErrorBoundary>,
    );
    expect(screen.queryByText("level on screen")).not.toBeInTheDocument();
  });
});
