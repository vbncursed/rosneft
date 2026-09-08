import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TerritoryCardModel } from "@/entities/territory";
import type { ConsoleNavItem } from "@/widgets/console-nav";
import type { ConsoleHint } from "../model/console-hints";
import type { HomeState } from "../model/use-home";
import { HomeScreen } from "./home-screen";

const { useHome, useConsoleCounters, navigate } = vi.hoisted(() => ({
  useHome: vi.fn(),
  useConsoleCounters: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("../model/use-home", () => ({ useHome }));
vi.mock("../model/use-console-counters", () => ({ useConsoleCounters }));
// A stand-in for the router context: the screen is rendered on its own.
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

const KEYS = ["users", "roles", "content", "access", "audit", "metrics"] as const;

const items = (open: boolean): ConsoleNavItem[] =>
  KEYS.map((key) => ({
    key,
    label: key,
    href: `/console/${key}`,
    ...(open ? {} : { disabled: true }),
  }));

const hint: ConsoleHint = { kind: "count", text: "3 users" };
const hints = Object.fromEntries(KEYS.map((k) => [k, hint])) as Record<string, ConsoleHint>;

const card: TerritoryCardModel = {
  slug: "north-ridge",
  title: "North Ridge",
  status: "ready",
  chips: [],
  trailing: { label: "Open →", tone: "accent" },
  panorama: false,
};

const state = (over: Partial<HomeState> = {}): HomeState => ({
  status: "ready",
  error: null,
  meta: "1 territory · 0 models · nothing converting",
  canUploadTerritory: true,
  canUploadModel: true,
  jobs: [],
  jobsMeta: "0 jobs",
  territories: { cards: [card], total: 1, meta: "showing 1 of 1", viewerEmpty: false },
  models: { cards: [], total: 0, meta: "none yet", shown: true },
  activity: [],
  activityLoading: false,
  ...over,
});

beforeEach(() => {
  useHome.mockReset();
  useConsoleCounters.mockReset();
  useConsoleCounters.mockReturnValue(hints);
  navigate.mockReset();
});

describe("HomeScreen", () => {
  it("shows skeletons while loading", () => {
    useHome.mockReturnValue(state({ status: "loading" }));
    render(<HomeScreen consoleItems={items(true)} />);
    expect(screen.getByRole("status", { name: "Loading home" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("prints the gateway's sentence when unavailable", () => {
    useHome.mockReturnValue(state({ status: "unavailable", error: "down" }));
    render(<HomeScreen consoleItems={items(true)} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Home is unavailable: down");
    expect(screen.queryByRole("status", { name: "Loading home" })).not.toBeInTheDocument();
  });

  it("renders the page when ready", () => {
    useHome.mockReturnValue(state());
    render(<HomeScreen consoleItems={items(true)} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Territories and models" }),
    ).toBeInTheDocument();
  });

  it("navigates to the v2 upload routes rather than leaving the SPA", async () => {
    useHome.mockReturnValue(state());
    render(<HomeScreen consoleItems={items(true)} />);
    await userEvent.click(screen.getByRole("button", { name: "Upload territory" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/territories/new" });
    await userEvent.click(screen.getByRole("button", { name: "Upload model" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/models/new" });
  });

  it("navigates to a card's own href when it is opened", async () => {
    useHome.mockReturnValue(state());
    render(<HomeScreen consoleItems={items(true)} />);
    await userEvent.click(screen.getByRole("article", { name: "North Ridge" }));
    expect(navigate).toHaveBeenCalledWith({ href: "/territories/north-ridge" });
  });

  it("draws the console section with one card per open screen", () => {
    useHome.mockReturnValue(state());
    render(<HomeScreen consoleItems={items(true)} />);
    expect(screen.getByRole("heading", { name: "Console" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^users/ })).toHaveAttribute(
      "href",
      "/console/users",
    );
  });

  it("draws the one open screen as a link and the five closed ones disabled", () => {
    useHome.mockReturnValue(state());
    const mixed = items(false).map((i) => (i.key === "content" ? { ...i, disabled: false } : i));
    render(<HomeScreen consoleItems={mixed} />);
    expect(screen.getByRole("link", { name: /^content/ })).toHaveAttribute(
      "href",
      "/console/content",
    );
    expect(screen.queryByRole("link", { name: /^audit/ })).not.toBeInTheDocument();
    expect(screen.getByText("audit").closest("[aria-disabled]")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("hides the console section when every screen is closed to the reader", () => {
    useHome.mockReturnValue(state());
    render(<HomeScreen consoleItems={items(false)} />);
    expect(screen.queryByRole("heading", { name: "Console" })).not.toBeInTheDocument();
  });

  it("survives a console key the counters do not know", () => {
    useHome.mockReturnValue(state());
    render(
      <HomeScreen
        consoleItems={[{ key: "tasks", label: "Tasks", href: "/console/tasks" }]}
      />,
    );
    expect(screen.getByRole("link", { name: /^Tasks/ })).toBeInTheDocument();
  });

  it("hides the models section in the viewer-empty state", () => {
    useHome.mockReturnValue(
      state({ models: { cards: [], total: 0, meta: "none yet", shown: false } }),
    );
    render(<HomeScreen consoleItems={items(true)} />);
    expect(screen.queryByRole("heading", { name: "Models" })).not.toBeInTheDocument();
  });
});
