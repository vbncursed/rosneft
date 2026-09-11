import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "./error-state";

describe("ErrorState", () => {
  it("announces itself the moment it renders", () => {
    render(<ErrorState title="Could not load the journal" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the journal");
  });

  it("carries the technical detail alongside the headline", () => {
    render(
      <ErrorState
        title="Could not load the journal"
        detail="HTTP 503 · audit-service unavailable"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("HTTP 503 · audit-service unavailable");
  });

  it("offers a retry when one is given", async () => {
    const onRetry = vi.fn();
    render(
      <ErrorState
        title="Could not load the journal"
        action={
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        }
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders headline-only", () => {
    render(<ErrorState title="Something broke" />);
    expect(screen.getByRole("alert").querySelectorAll("p")).toHaveLength(1);
  });

  describe("size lg — the centred card a failed viewport draws", () => {
    const card = () =>
      render(
        <ErrorState
          size="lg"
          icon="warning"
          title="The territory mesh could not be loaded"
          detail="Storage returned 502 for the LOD 1 mesh."
          footer="refinery-block-c-lod1.glb · last attempt 14:22"
          action={
            <button type="button">Try again</button>
          }
        />,
      );

    it("keeps the alert role, so a failure still announces itself", () => {
      card();
      expect(screen.getByRole("alert")).toHaveTextContent("The territory mesh could not be loaded");
    });

    it("draws the icon tile", () => {
      const { container } = card();
      expect(container.querySelector("svg")).not.toBeNull();
    });

    it("prints the footer line under the actions", () => {
      card();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "refinery-block-c-lod1.glb · last attempt 14:22",
      );
    });

    it("keeps the action reachable", () => {
      card();
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });

    it("draws no footer slot when nothing was given", () => {
      render(<ErrorState size="lg" title="Broken" />);
      expect(screen.getByRole("alert").querySelectorAll("p")).toHaveLength(1);
    });
  });
});
