import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionHeading } from "./section-heading";

describe("SectionHeading", () => {
  it("renders the title as a heading", () => {
    render(<SectionHeading title="Field operators" />);
    expect(screen.getByRole("heading", { level: 2, name: "Field operators" })).toBeInTheDocument();
  });

  it("takes the level it is given, so a page outline stays sane", () => {
    render(<SectionHeading title="Today" as="h3" />);
    expect(screen.getByRole("heading", { level: 3, name: "Today" })).toBeInTheDocument();
  });

  it("shows a count beside the title", () => {
    render(<SectionHeading title="Field operators" count="11 people" />);
    expect(screen.getByText("11 people")).toBeInTheDocument();
  });

  it("shows a zero count rather than hiding it", () => {
    render(<SectionHeading title="Sunday" count={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("omits the count when there is none", () => {
    const { container } = render(<SectionHeading title="Field operators" />);
    expect(container.querySelectorAll("span")).toHaveLength(1);
  });

  it("hides the rule from assistive tech", () => {
    const { container } = render(<SectionHeading title="X" />);
    expect(container.querySelector("span[aria-hidden]")).toBeInTheDocument();
  });
});
