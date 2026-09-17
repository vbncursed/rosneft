import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourcePair } from "./source-pair";

const TERRITORY = {
  slug: "t",
  title: "T",
  sourceBlobHash: "5b81" + "0".repeat(56) + "c40e",
  placementCount: 0,
  createdAt: "2026-09-02T00:00:00Z",
};

const file = () => new File([new Uint8Array(2048)], "rev4.zip");

describe("SourcePair", () => {
  it("shows the current source's short hash, bold, with its size and upload date", () => {
    render(<SourcePair territory={TERRITORY} currentSize={1024} file={null} />);
    expect(screen.getByText("Current source")).toBeInTheDocument();
    expect(screen.getByText("sha256:5b81…c40e")).toBeInTheDocument();
    expect(screen.getByText("1 KB")).toBeInTheDocument();
    expect(screen.getByText("02.09")).toBeInTheDocument();
  });

  it("says no file is chosen yet before one is picked", () => {
    render(<SourcePair territory={TERRITORY} currentSize={1024} file={null} />);
    expect(screen.getByText("New source")).toBeInTheDocument();
    expect(screen.getByText("No file chosen yet.")).toBeInTheDocument();
  });

  it("shows the picked file's name and its delta once one is chosen", () => {
    render(<SourcePair territory={TERRITORY} currentSize={1024} file={file()} />);
    expect(screen.getByText("rev4.zip")).toBeInTheDocument();
    expect(screen.getByText("+1 KB")).toBeInTheDocument();
    expect(screen.queryByText("No file chosen yet.")).not.toBeInTheDocument();
  });
});
