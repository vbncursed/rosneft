import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoverageMeter } from "./coverage-meter";
import type { CoverageSegment } from "./coverage";

const SEGMENTS: CoverageSegment[] = [
  { tone: "ok", value: 18, label: "2FA + passkey" },
  { tone: "warn", value: 3, label: "2FA only" },
  { tone: "bad", value: 5, label: "password only" },
];

describe("CoverageMeter", () => {
  it("labels the population and its readout", () => {
    render(<CoverageMeter label="2FA coverage" segments={SEGMENTS} detail="18 / 26" />);
    expect(screen.getByText("2FA coverage")).toBeInTheDocument();
    expect(screen.getByText("18 / 26")).toBeInTheDocument();
  });

  it("spells the split out for a reader who cannot see the bar", () => {
    render(<CoverageMeter label="2FA coverage" segments={SEGMENTS} />);
    expect(
      screen.getByRole("img", {
        name: "2FA coverage: 2FA + passkey 69%, 2FA only 12%, password only 19%",
      }),
    ).toBeInTheDocument();
  });

  it("lists every segment in the legend with its count", () => {
    render(<CoverageMeter label="2FA coverage" segments={SEGMENTS} />);
    expect(screen.getByText(/2FA \+ passkey · 18/)).toBeInTheDocument();
    expect(screen.getByText(/password only · 5/)).toBeInTheDocument();
  });

  it("keeps an empty segment in the legend but out of the bar", () => {
    const { container } = render(
      <CoverageMeter
        label="2FA coverage"
        segments={[
          { tone: "ok", value: 10, label: "covered" },
          { tone: "bad", value: 0, label: "uncovered" },
        ]}
      />,
    );
    expect(screen.getByText(/uncovered · 0/)).toBeInTheDocument();
    expect(container.querySelectorAll("[role='img'] > span")).toHaveLength(1);
  });

  it("sizes the bar by flex-grow, so the segments always fill it", () => {
    const { container } = render(<CoverageMeter label="2FA coverage" segments={SEGMENTS} />);
    const bars = [...container.querySelectorAll<HTMLElement>("[role='img'] > span")];
    expect(bars.map((b) => b.style.flexGrow)).toEqual(["18", "3", "5"]);
  });

  it("takes the readout's tone from the caller when the default is wrong", () => {
    render(
      <CoverageMeter label="2FA coverage" segments={SEGMENTS} detail="8 / 26" detailTone="bad" />,
    );
    expect(screen.getByText("8 / 26").className).toContain("text-bad");
  });
});
