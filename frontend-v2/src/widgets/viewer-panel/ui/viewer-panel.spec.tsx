import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ViewerPanel } from "./viewer-panel";

const back = { label: "← Catalog", href: "/territories" };

describe("ViewerPanel", () => {
  it("names the scene and links back to the catalog", () => {
    render(<ViewerPanel title="Refinery Block C" back={back} />);
    expect(screen.getByText("Refinery Block C")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Catalog" })).toHaveAttribute(
      "href",
      "/territories",
    );
  });

  it("prints the mesh statistics readably", () => {
    render(
      <ViewerPanel
        title="Refinery Block C"
        back={back}
        metadata={{ vertices: 4812330, faces: 1604110, dimensions: { x: 182, y: 44, z: 96 } }}
      />,
    );
    expect(screen.getByText(/Vertices: 4 812 330/)).toBeInTheDocument();
    expect(screen.getByText(/Faces: 1 604 110/)).toBeInTheDocument();
    expect(screen.getByText("Size: 182 / 44 / 96")).toBeInTheDocument();
  });

  it("omits a statistic the artifact does not carry", () => {
    render(<ViewerPanel title="T" back={back} metadata={{ vertices: 100 }} />);
    expect(screen.getByText(/Vertices/)).toBeInTheDocument();
    expect(screen.queryByText(/Faces/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Size/)).not.toBeInTheDocument();
  });

  it("shows no statistics block at all when there is no metadata", () => {
    render(<ViewerPanel title="T" back={back} />);
    expect(screen.queryByText(/Vertices/)).not.toBeInTheDocument();
  });

  it("shows the navigation hint by default", () => {
    render(<ViewerPanel title="T" back={back} />);
    expect(screen.getByText(/Drag: rotate/)).toBeInTheDocument();
  });

  it("replaces the hint while a tool is active, and accents it", () => {
    render(
      <ViewerPanel
        title="T"
        back={back}
        toolHint="Click to extend · click the start dot to close the loop · Esc breaks the chain."
      />,
    );
    const hint = screen.getByText(/Click to extend/);
    expect(hint.className).toContain("text-accent");
    expect(screen.queryByText(/Drag: rotate/)).not.toBeInTheDocument();
  });
});
