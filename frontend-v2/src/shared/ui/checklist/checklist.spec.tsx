import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Checklist } from "./checklist";

describe("Checklist", () => {
  it("lists every item under a labelled list", () => {
    render(
      <Checklist
        label="Archive checklist"
        items={[
          { label: "Single ZIP, no nested archives", ok: true },
          { label: "Metres as units", ok: false },
        ]}
      />,
    );
    expect(screen.getByRole("list", { name: "Archive checklist" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("draws a satisfied item with the check icon and full-strength text", () => {
    const { container } = render(<Checklist items={[{ label: "Titles are unique", ok: true }]} />);
    expect(container.querySelector('path[d="M20 6 9 17l-5-5"]')).toBeInTheDocument();
    expect(screen.getByText("Titles are unique").className).toContain("text-fg");
  });

  it("draws an unmet item with the minus icon and muted text", () => {
    const { container } = render(<Checklist items={[{ label: "Thumbnails are square", ok: false }]} />);
    expect(container.querySelector('path[d="M6 12h12"]')).toBeInTheDocument();
    expect(screen.getByText("Thumbnails are square").className).toContain("text-muted");
  });

  it("names itself Checklist by default", () => {
    render(<Checklist items={[{ label: "x", ok: true }]} />);
    expect(screen.getByRole("list", { name: "Checklist" })).toBeInTheDocument();
  });
});
