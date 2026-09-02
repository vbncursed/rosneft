import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("names the gap", () => {
    render(<EmptyState title="Catalog is empty" />);
    expect(screen.getByText("Catalog is empty")).toBeInTheDocument();
  });

  it("explains and offers the way out", async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="Catalog is empty"
        description="Upload your first territory."
        action={
          <button type="button" onClick={onClick}>
            + Upload
          </button>
        }
      />,
    );
    expect(screen.getByText("Upload your first territory.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ Upload" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders with neither description nor action", () => {
    const { container } = render(<EmptyState title="Nothing here" />);
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("is not an alert — an empty catalog is not an error", () => {
    render(<EmptyState title="Catalog is empty" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
