import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentItem } from "@/entities/content";
import type { ContentState } from "../model/use-content";
import { ContentScreen } from "./content-screen";

const { useContent, leaveTo } = vi.hoisted(() => ({ useContent: vi.fn(), leaveTo: vi.fn() }));
vi.mock("../model/use-content", () => ({ useContent }));
vi.mock("@/shared/lib/leave", () => ({ leaveTo }));

const T: ContentItem = {
  kind: "territory",
  slug: "t-1",
  title: "T 1",
  status: "ready",
  meta: "t-1 · upd. 31.08",
  lods: "LOD 0-2",
  size: "412 MB",
};
const M: ContentItem = {
  kind: "model",
  slug: "m-1",
  title: "M 1",
  status: "pending",
  meta: "m-1",
  lods: "—",
  size: "—",
};

const state = (over: Partial<ContentState> = {}): ContentState => ({
  status: "ready",
  error: null,
  items: [T, M],
  storageBytes: 412 * 1024 * 1024,
  canManage: true,
  canDelete: () => true,
  artifactsOf: () => [{ lod: 0, size: 1 }],
  jobOf: () => undefined,
  updatedAtOf: () => "2026-08-31T00:00:00Z",
  query: "",
  setQuery: vi.fn(),
  selected: null,
  select: vi.fn(),
  deselect: vi.fn(),
  pending: null,
  ask: vi.fn(),
  confirm: vi.fn(),
  dismiss: vi.fn(),
  busy: false,
  ...over,
});

beforeEach(() => {
  useContent.mockReset();
  leaveTo.mockReset();
});

describe("ContentScreen", () => {
  it("shows skeletons while loading and the gateway's sentence when unavailable", () => {
    useContent.mockReturnValue(state({ status: "loading", items: null }));
    const { unmount } = render(<ContentScreen />);
    expect(screen.getByRole("status", { name: "Loading content" })).toBeInTheDocument();
    unmount();
    useContent.mockReturnValue(
      state({
        status: "unavailable",
        items: null,
        error: "You don't have permission to do this",
      }),
    );
    render(<ContentScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent("You don't have permission to do this");
  });

  it("groups the rows and filters them through the model", () => {
    useContent.mockReturnValue(state({ query: "kind:model" }));
    render(<ContentScreen />);
    expect(screen.queryByRole("article", { name: "T 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "M 1" })).toBeInTheDocument();
  });

  it("sends the upload buttons into the old SPA", async () => {
    useContent.mockReturnValue(state());
    render(<ContentScreen />);
    await userEvent.click(screen.getByRole("button", { name: "+ Territory" }));
    expect(leaveTo).toHaveBeenCalledWith("/territories/new");
    await userEvent.click(screen.getByRole("button", { name: "+ Model" }));
    expect(leaveTo).toHaveBeenCalledWith("/models/new");
  });

  it("opens the inspector for a territory with replace, open and delete", async () => {
    const s = state({ selected: T });
    useContent.mockReturnValue(s);
    render(<ContentScreen />);
    const aside = screen.getByRole("complementary", { name: "Content: T 1" });
    await userEvent.click(within(aside).getByRole("button", { name: "Replace source" }));
    expect(leaveTo).toHaveBeenCalledWith("/territories/t-1/replace");
    await userEvent.click(within(aside).getByRole("button", { name: "Open in viewer" }));
    expect(leaveTo).toHaveBeenCalledWith("/territories/t-1");
    await userEvent.click(within(aside).getByRole("button", { name: "Delete" }));
    expect(s.ask).toHaveBeenCalled();
  });

  it("offers a row its own menu, mirroring the inspector's actions", async () => {
    useContent.mockReturnValue(state());
    render(<ContentScreen />);

    const row = screen.getByRole("article", { name: "T 1" });
    await userEvent.click(within(row).getByRole("button", { name: "Row actions for T 1" }));
    expect(screen.getByRole("menuitem", { name: "Open in viewer" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Replace source" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("menuitem", { name: "Open in viewer" }));
    expect(leaveTo).toHaveBeenCalledWith("/territories/t-1");
  });

  it("replaces a source from the row, without opening the inspector first", async () => {
    const s = state();
    useContent.mockReturnValue(s);
    render(<ContentScreen />);
    const row = screen.getByRole("article", { name: "T 1" });
    await userEvent.click(within(row).getByRole("button", { name: "Row actions for T 1" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Replace source" }));
    expect(leaveTo).toHaveBeenCalledWith("/territories/t-1/replace");
    // The menu sits inside the row's own click target; reaching an action must
    // not also select the row and swing the inspector open behind the menu.
    expect(s.select).not.toHaveBeenCalled();
  });

  it("offers no viewer for a row with nothing converted, as the inspector does not", async () => {
    useContent.mockReturnValue(state({ artifactsOf: (_k, slug) => (slug === "t-1" ? [{ lod: 0, size: 1 }] : []) }));
    render(<ContentScreen />);
    const row = screen.getByRole("article", { name: "M 1" });
    await userEvent.click(within(row).getByRole("button", { name: "Row actions for M 1" }));
    expect(screen.getByRole("menuitem", { name: "Open in viewer" })).toBeDisabled();
  });

  it("offers a model no Replace source in its row menu — there is no route", async () => {
    useContent.mockReturnValue(state());
    render(<ContentScreen />);
    const row = screen.getByRole("article", { name: "M 1" });
    await userEvent.click(within(row).getByRole("button", { name: "Row actions for M 1" }));
    expect(screen.getByRole("menuitem", { name: "Open in viewer" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Replace source" })).not.toBeInTheDocument();
  });

  it("offers no row menu to a reader who may not manage the catalog", () => {
    useContent.mockReturnValue(state({ canManage: false }));
    render(<ContentScreen />);
    expect(screen.queryByRole("button", { name: /^Row actions for / })).not.toBeInTheDocument();
  });

  it("draws no Replace source for a model and no Delete without the grant", () => {
    useContent.mockReturnValue(state({ selected: M, canDelete: () => false }));
    render(<ContentScreen />);
    const aside = screen.getByRole("complementary", { name: "Content: M 1" });
    expect(within(aside).queryByRole("button", { name: "Replace source" })).not.toBeInTheDocument();
    expect(within(aside).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("shows the running conversion's bar and note in the inspector", () => {
    const converting: ContentItem = { ...T, status: "converting", progress: 62, stage: "textures" };
    useContent.mockReturnValue(
      state({
        items: [converting, M],
        selected: converting,
        jobOf: () => ({
          kind: "territory",
          slug: "t-1",
          status: "running",
          progress: 0.62,
          stage: "textures",
          errorMessage: null,
        }),
      }),
    );
    render(<ContentScreen />);
    const aside = screen.getByRole("complementary", { name: "Content: T 1" });
    expect(within(aside).getByRole("progressbar", { name: "T 1 conversion" })).toBeInTheDocument();
    expect(within(aside).getByText("62% · textures")).toBeInTheDocument();
  });

  it("puts the worker's error at the top of a failed row's inspector", () => {
    const broken: ContentItem = { ...T, status: "failed" };
    useContent.mockReturnValue(
      state({
        items: [broken, M],
        selected: broken,
        jobOf: () => ({
          kind: "territory",
          slug: "t-1",
          status: "failed",
          progress: null,
          stage: null,
          errorMessage: "OBJ parse error at line 84120",
        }),
      }),
    );
    render(<ContentScreen />);
    const aside = screen.getByRole("complementary", { name: "Content: T 1" });
    expect(within(aside).getByText("Error")).toBeInTheDocument();
    expect(within(aside).getByText("OBJ parse error at line 84120")).toBeInTheDocument();
  });

  it("keeps a converted territory openable while its re-conversion fails", async () => {
    const broken: ContentItem = { ...T, status: "failed" };
    useContent.mockReturnValue(state({ items: [broken, M], selected: broken }));
    const { unmount } = render(<ContentScreen />);
    const aside = screen.getByRole("complementary", { name: "Content: T 1" });
    const open = within(aside).getByRole("button", { name: "Open in viewer" });
    expect(open).toBeEnabled();
    await userEvent.click(open);
    expect(leaveTo).toHaveBeenCalledWith("/territories/t-1");

    // ...and a row that has never converted still cannot be opened.
    unmount();
    useContent.mockReturnValue(state({ selected: M, artifactsOf: () => [] }));
    render(<ContentScreen />);
    expect(
      within(screen.getByRole("complementary", { name: "Content: M 1" })).getByRole("button", {
        name: "Open in viewer",
      }),
    ).toBeDisabled();
  });

  it("says the catalog is empty rather than blaming the filter", () => {
    useContent.mockReturnValue(state({ items: [], storageBytes: 0 }));
    render(<ContentScreen />);
    expect(screen.getByText("Nothing uploaded yet — start with a territory.")).toBeInTheDocument();
  });

  it("asks before deleting and hands the answer to the container", async () => {
    const s = state({ selected: T, pending: T });
    useContent.mockReturnValue(s);
    render(<ContentScreen />);
    const dialog = screen.getByRole("dialog", { name: "Delete T 1?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(s.confirm).toHaveBeenCalled();
  });
});
