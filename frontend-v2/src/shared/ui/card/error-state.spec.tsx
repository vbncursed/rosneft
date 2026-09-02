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
});
