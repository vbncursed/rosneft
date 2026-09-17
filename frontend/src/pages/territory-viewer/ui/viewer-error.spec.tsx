import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ViewerError } from "./viewer-error";

const COPY = {
  title: "The territory mesh could not be loaded",
  body: "Storage returned 502 for the LOD 1 mesh. The scene, placements and documents are intact — only the artifact download failed.",
  footer: "refinery-block-c-lod1.glb · last attempt 14:22",
  coarseLabel: "Load coarse LOD 2 instead",
};

describe("ViewerError", () => {
  it("announces the failure and says what is still intact", () => {
    render(<ViewerError copy={COPY} onRetry={vi.fn()} onCoarse={vi.fn()} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The territory mesh could not be loaded");
    expect(alert).toHaveTextContent("Storage returned 502 for the LOD 1 mesh.");
  });

  it("names the file and the last attempt in the footnote", () => {
    render(<ViewerError copy={COPY} onRetry={vi.fn()} onCoarse={vi.fn()} />);
    expect(screen.getByText(COPY.footer)).toBeInTheDocument();
  });

  it("retries on request", async () => {
    const onRetry = vi.fn();
    render(<ViewerError copy={COPY} onRetry={onRetry} onCoarse={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("offers the coarser level by name, and asks for it on click", async () => {
    const onCoarse = vi.fn();
    render(<ViewerError copy={COPY} onRetry={vi.fn()} onCoarse={onCoarse} />);
    await userEvent.click(screen.getByRole("button", { name: "Load coarse LOD 2 instead" }));
    expect(onCoarse).toHaveBeenCalledOnce();
  });

  it("offers only the retry when the failed level is the coarsest there is", () => {
    render(
      <ViewerError copy={{ ...COPY, coarseLabel: null }} onRetry={vi.fn()} onCoarse={null} />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
