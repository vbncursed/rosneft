import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { JobCardModel } from "../model/job-card";
import { JobCard } from "./job-card";

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

describe("JobCard", () => {
  it("names the job, prints its status word, meta and a uniquely named link", () => {
    render(<JobCard card={card()} />);
    const article = screen.getByRole("article", { name: "Refinery Block C" });
    // "Refinery Block C" is both the title and part of the link's text, so the
    // title is read off the title row rather than the whole card.
    expect(within(article).getByText("converting")).toBeInTheDocument();
    expect(
      within(article).getByText("territory · refinery-block-c · building LOD 1"),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open territory refinery-block-c" });
    expect(link).toHaveAttribute("href", "/territories/refinery-block-c");
    expect(link).toHaveTextContent("Open Refinery Block C →");
  });

  it("draws the bar and the percent while converting", () => {
    render(<JobCard card={card()} />);
    expect(
      screen.getByRole("progressbar", { name: "Conversion of Refinery Block C" }),
    ).toHaveAttribute("aria-valuenow", "58");
    expect(screen.getByText("58%")).toBeInTheDocument();
  });

  it("draws neither bar nor message while queued", () => {
    render(<JobCard card={card({ status: "queued", percent: undefined })} />);
    expect(screen.getByText("queued")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("prints the worker's message when failed, selectable", () => {
    render(
      <JobCard
        card={card({
          status: "failed",
          percent: undefined,
          error: "ktx2: unsupported pixel format",
        })}
      />,
    );
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("ktx2: unsupported pixel format").className).toContain("select-text");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("names each of two cards for the same title by kind and slug", () => {
    render(
      <>
        <JobCard card={card()} />
        <JobCard card={card({ kind: "model", slug: "refinery-block-c", href: "/models/refinery-block-c" })} />
      </>,
    );
    expect(screen.getByRole("link", { name: "Open territory refinery-block-c" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open model refinery-block-c" })).toBeInTheDocument();
  });
});
