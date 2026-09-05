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

describe("EmptyState · row layout", () => {
  it("draws a compact row with an icon, title, description and trailing action", () => {
    render(
      <EmptyState
        layout="row"
        icon="upload"
        title="Add another territory"
        description="ZIP with OBJ + MTL + textures — conversion starts automatically."
        action={<button type="button">Upload territory</button>}
      />,
    );
    expect(screen.getByText("Add another territory")).toBeInTheDocument();
    expect(screen.getByText(/conversion starts automatically/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload territory" })).toBeInTheDocument();
  });

  it("keeps the centered layout the default", () => {
    const { container } = render(<EmptyState title="Nothing here" />);
    expect(container.firstElementChild!.className).toContain("text-center");
  });

  it("left-aligns the row layout instead of centering", () => {
    const { container } = render(<EmptyState layout="row" title="Add another territory" />);
    expect(container.firstElementChild!.className).toContain("text-left");
    expect(container.firstElementChild!.className).not.toContain("text-center");
  });
});
