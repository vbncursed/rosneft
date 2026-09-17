import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { JobCardModel } from "@/entities/conversion";
import { JobsSection } from "./jobs-section";

const card = (over: Partial<JobCardModel> = {}): JobCardModel => ({
  kind: "territory",
  slug: "refinery-block-c",
  title: "Refinery Block C",
  href: "/territories/refinery-block-c",
  status: "converting",
  meta: "territory · refinery-block-c · building LOD 1",
  percent: 58,
  ...over,
});

describe("JobsSection", () => {
  it("renders nothing with no jobs", () => {
    const { container } = render(<JobsSection jobs={[]} meta="0 jobs" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists one card per job under the heading and meta", () => {
    render(
      <JobsSection
        jobs={[
          card(),
          card({ kind: "model", slug: "valve", title: "Valve", href: "/models/valve" }),
        ]}
        meta="2 jobs · updates by itself"
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "In progress" })).toBeInTheDocument();
    expect(screen.getByText("2 jobs · updates by itself")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "Open territory refinery-block-c" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open model valve" })).toBeInTheDocument();
  });
});
