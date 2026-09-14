import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./progress-bar";

describe("ProgressBar", () => {
  it("reports its value to assistive tech", () => {
    render(<ProgressBar value={64} label="Uploading chunks" detail="64%" />);
    const bar = screen.getByRole("progressbar", { name: "Uploading chunks" });
    expect(bar).toHaveAttribute("aria-valuenow", "64");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(screen.getByText("64%")).toBeInTheDocument();
  });

  it("clamps a value outside the range", () => {
    const { rerender } = render(<ProgressBar value={140} ariaLabel="p" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");

    rerender(<ProgressBar value={-20} ariaLabel="p" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("omits a value entirely when indeterminate", () => {
    render(<ProgressBar ariaLabel="Waiting for conversion to start" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(bar.firstElementChild!.className).toContain("animate-indeterminate");
  });

  it("carries the tone into the fill and the caption", () => {
    const { rerender } = render(<ProgressBar value={100} tone="ok" label="Done" />);
    expect(screen.getByText("Done").parentElement!.className).toContain("text-ok");

    rerender(<ProgressBar value={38} tone="bad" label="Conversion failed" />);
    expect(screen.getByRole("progressbar").className).toContain("border-bad");
  });

  it("renders without a caption when neither label nor detail is given", () => {
    const { container } = render(<ProgressBar value={10} ariaLabel="p" />);
    expect(container.querySelector("p")).toBeNull();
  });
});

describe("ProgressBar · thin", () => {
  it("drops the frame for a meter inside a card", () => {
    const { container } = render(<ProgressBar variant="thin" value={40} ariaLabel="Granted" />);
    const track = screen.getByRole("progressbar");
    expect(track.className).toContain("h-[5px]");
    expect(track.className).not.toContain("border-line");
    expect(container).toBeTruthy();
  });

  it("still reports its value", () => {
    render(<ProgressBar variant="thin" value={40} ariaLabel="Granted" />);
    expect(screen.getByRole("progressbar", { name: "Granted" })).toHaveAttribute(
      "aria-valuenow",
      "40",
    );
  });
});

describe("ProgressBar · lg", () => {
  it("draws the mock's 8px framed track with the caption above it", () => {
    const { container } = render(
      <ProgressBar size="lg" value={58} label="Building LOD 1" detail="58%" />,
    );
    const track = screen.getByRole("progressbar", { name: "Building LOD 1" });
    expect(track).toHaveAttribute("aria-valuenow", "58");
    expect(track.className).toContain("h-2");
    expect(track.className).toContain("border-line");
    const caption = container.querySelector("p")!;
    // The caption precedes the track in the DOM — the mock's row sits above the bar.
    expect(caption.compareDocumentPosition(track) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("58%").className).toContain("text-accent");
    expect(screen.getByText("Building LOD 1").className).toContain("font-semibold");
  });

  it("draws the caption alone, muted, when there is no value to show", () => {
    render(<ProgressBar size="lg" label="Waiting for a worker" detail="no progress reported" />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("no progress reported").className).toContain("text-muted");
    expect(screen.getByText("Waiting for a worker")).toBeInTheDocument();
  });

  it("draws the bare track with neither label nor detail", () => {
    const { container } = render(<ProgressBar size="lg" value={58} ariaLabel="Conversion" />);
    expect(container.querySelector("p")).toBeNull();
    expect(screen.getByRole("progressbar", { name: "Conversion" }).className).toContain("h-2");
  });

  it("leaves md exactly as it was", () => {
    render(<ProgressBar value={64} label="Uploading chunks" detail="64%" />);
    expect(screen.getByRole("progressbar").className).toContain("h-1.5");
    expect(screen.getByText("64%").parentElement!.className).toContain("mt-[7px]");
  });
});
