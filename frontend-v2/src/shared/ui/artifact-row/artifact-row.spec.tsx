import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArtifactRow } from "./artifact-row";

const props = { tag: "LOD 1", file: "valve-lod1.glb", meta: "6 140 tris · mid range", size: "2.1 MB" };

describe("ArtifactRow", () => {
  it("prints the tag, file, meta and size", () => {
    render(<ArtifactRow {...props} />);
    expect(screen.getByText("LOD 1")).toBeInTheDocument();
    expect(screen.getByText("valve-lod1.glb")).toBeInTheDocument();
    expect(screen.getByText("6 140 tris · mid range")).toBeInTheDocument();
    expect(screen.getByText("2.1 MB")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("is a download link named by its file when given an href", () => {
    render(<ArtifactRow {...props} href="/api/assets/abc" />);
    const link = screen.getByRole("link", { name: /valve-lod1\.glb/ });
    expect(link).toHaveAttribute("href", "/api/assets/abc");
    expect(link).toHaveAttribute("download", "valve-lod1.glb");
  });

  it("truncates a long file name rather than wrapping it", () => {
    render(<ArtifactRow {...props} file="a-very-long-file-name-that-does-not-fit-lod1.glb" />);
    expect(screen.getByText(/a-very-long/)).toHaveClass("truncate");
  });
});
