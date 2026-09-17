import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "@/entities/audit";
import type { JobCardModel } from "@/entities/conversion";
import type { ModelCardModel } from "@/entities/model";
import type { TerritoryCardModel } from "@/entities/territory";
import { HomePage, type HomePageProps } from "./home-page";

const territory = (slug: string): TerritoryCardModel => ({
  slug,
  title: slug,
  status: "ready",
  chips: [],
  trailing: { label: "Open →", tone: "accent" },
  panorama: false,
});

const model = (slug: string): ModelCardModel => ({
  slug,
  title: slug,
  status: "ready",
  thumbnailUrl: null,
  usageCount: 0,
  size: "—",
  lods: "—",
  trailing: { label: "unused", tone: "muted" },
});

const job = (over: Partial<JobCardModel> = {}): JobCardModel => ({
  kind: "territory",
  slug: "refinery-block-c",
  title: "Refinery Block C",
  href: "/territories/refinery-block-c",
  status: "converting",
  meta: "territory · refinery-block-c · building LOD 1",
  percent: 58,
  ...over,
});

const entry = (id: number, action: string): AuditEntry => ({
  id,
  at: new Date().toISOString(),
  actorId: "u-1",
  actorLogin: "a.ivanova",
  companyId: "",
  companyLogin: "",
  action,
  entity: "",
  entityId: "",
  entityLabel: "",
  territorySlug: "",
  oldRow: null,
  newRow: null,
  result: "ok",
});

const base: HomePageProps = {
  meta: "4 territories · 57 models · 1 converting",
  viewer: { username: "a.ivanova", roleTitle: "Company Owner" },
  jobs: [],
  jobsMeta: "0 jobs",
  territories: { cards: [territory("north-ridge-pad")], total: 1, meta: "showing 1 of 1", viewerEmpty: false },
  models: { cards: [model("valve-assembly")], total: 1, meta: "1 in the library" },
  console: [
    { label: "Users", href: "/console/users", hint: { kind: "count", text: "12 users" }, locked: false },
    { label: "Metrics", href: "/console/metrics", hint: { kind: "static", text: "conversion health and alerts" }, locked: true },
  ],
  activity: [entry(1, "auth.login")],
  activityLoading: false,
  onOpen: vi.fn(),
};

const page = (over: Partial<HomePageProps> = {}) => render(<HomePage {...base} {...over} />);

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false } as MediaQueryList));
});

describe("HomePage", () => {
  it("titles the page and prints the header meta", () => {
    page();
    expect(
      screen.getByRole("heading", { level: 1, name: "Territories and models" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Andrey Viewer")).toBeInTheDocument();
    expect(screen.getByText("4 territories · 57 models · 1 converting")).toBeInTheDocument();
  });

  it("puts the reader's account pill in the header", () => {
    page();
    expect(screen.getByRole("link", { name: "Open account for a.ivanova" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(screen.getByText("Company Owner")).toBeInTheDocument();
  });

  it("hides the strip with no jobs and names each job's link apart with two", () => {
    const { rerender } = page();
    expect(screen.queryByRole("heading", { name: "In progress" })).not.toBeInTheDocument();

    rerender(
      <HomePage
        {...base}
        jobs={[job(), job({ kind: "model", slug: "valve", title: "Valve", href: "/models/valve" })]}
        jobsMeta="2 jobs · updates by itself"
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "In progress" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open territory refinery-block-c" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open model valve" })).toBeInTheDocument();
  });

  it("offers See all wherever a section has anything to see", () => {
    const { rerender } = page();
    expect(screen.getByRole("link", { name: "See all 1 territories →" })).toHaveAttribute(
      "href",
      "/territories",
    );
    expect(screen.getByRole("link", { name: "See all 1 models →" })).toHaveAttribute(
      "href",
      "/models",
    );

    rerender(
      <HomePage
        {...base}
        territories={{ cards: [], total: 0, meta: "none yet", viewerEmpty: false }}
        models={{ cards: [], total: 0, meta: "none yet" }}
      />,
    );
    expect(screen.queryByRole("link", { name: /See all/ })).not.toBeInTheDocument();
  });

  it("drops the models and console sections when there are none to show", () => {
    page({ models: null, console: null });
    expect(screen.queryByRole("heading", { name: "Models" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Console" })).not.toBeInTheDocument();
  });

  it("offers the console itself beside the section heading", () => {
    page();
    expect(screen.getByRole("link", { name: "Console →" })).toHaveAttribute("href", "/console");
  });

  it("draws a locked console card as no link at all", () => {
    page();
    expect(screen.getByRole("link", { name: /Users/ })).toHaveAttribute("href", "/console/users");
    expect(screen.getByText("Metrics").closest("[aria-disabled]")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("keeps loading, unavailable and answered activity apart", () => {
    const { rerender } = page({ activity: null, activityLoading: true });
    expect(screen.getByRole("status", { name: "Loading your activity" })).toBeInTheDocument();

    rerender(<HomePage {...base} activity={null} activityLoading={false} />);
    expect(screen.getByText("Your activity could not be loaded.")).toBeInTheDocument();

    rerender(<HomePage {...base} />);
    expect(screen.getByText("auth.login")).toBeInTheDocument();
  });

  it("names every article apart when a converting territory is also a card", () => {
    page({
      jobs: [job(), job({ kind: "model", slug: "valve", title: "Valve", href: "/models/valve" })],
      jobsMeta: "2 jobs · updates by itself",
      territories: {
        cards: [
          { ...territory("refinery-block-c"), title: "Refinery Block C" },
          territory("north-ridge-pad"),
        ],
        total: 2,
        meta: "showing 2 of 2",
        viewerEmpty: false,
      },
    });
    const names = screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"));
    expect(names).toHaveLength(5);
    expect(new Set(names).size).toBe(names.length);
  });

  it("draws no chrome of its own", () => {
    const { container } = page();
    expect(container.querySelector("main")).toBeNull();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
