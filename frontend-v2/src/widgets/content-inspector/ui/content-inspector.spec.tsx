import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContentInspector, type ContentInspectorProps } from "./content-inspector";
import type { ContentItem } from "@/entities/content";

const item = (over: Partial<ContentItem> = {}): ContentItem => ({
  kind: "territory",
  slug: "terminal-yard-4",
  title: "Terminal Yard 4",
  status: "converting",
  meta: "terminal-yard-4 · job 8f21",
  lods: "LOD 0-1",
  size: "760 MB",
  progress: 62,
  ...over,
});

const props = (over: Partial<ContentInspectorProps> = {}): ContentInspectorProps => ({
  item: item(),
  onClose: vi.fn(),
  onReplaceSource: vi.fn(),
  onOpenInViewer: vi.fn(),
  onDelete: vi.fn(),
  ...over,
});

describe("ContentInspector", () => {
  it("is a region named after the item", () => {
    render(<ContentInspector {...props()} />);
    expect(
      screen.getByRole("complementary", { name: "Content: Terminal Yard 4" }),
    ).toBeInTheDocument();
    expect(screen.getByText("terminal-yard-4 · territory")).toBeInTheDocument();
  });

  it("shows the conversion state as a badge", () => {
    render(<ContentInspector {...props()} />);
    expect(screen.getByText("converting")).toBeInTheDocument();
  });

  it("reports conversion progress and its note while converting", () => {
    render(<ContentInspector {...props({ conversionNote: "62% · ~4 min" })} />);
    expect(
      screen.getByRole("progressbar", { name: "Terminal Yard 4 conversion" }),
    ).toHaveAttribute("aria-valuenow", "62");
    expect(screen.getByText("62% · ~4 min")).toBeInTheDocument();
  });

  it("shows no conversion block at all once the item is ready", () => {
    render(<ContentInspector {...props({ item: item({ status: "ready", progress: undefined }) })} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("Conversion")).not.toBeInTheDocument();
  });

  it("lists the pipeline's stages while converting", () => {
    render(
      <ContentInspector
        {...props({
          stages: [
            { label: "Parsing OBJ", state: "done", time: "1m 12s" },
            { label: "Compressing textures", state: "active", time: "running" },
          ],
        })}
      />,
    );
    expect(screen.getByRole("list", { name: "Conversion stages" })).toBeInTheDocument();
    expect(screen.getByText("Compressing textures").className).toContain("text-warn");
  });

  it("lists the facts it is handed", () => {
    render(
      <ContentInspector
        {...props({
          details: [
            { label: "source", value: "terminal-yard-4.obj · 2.4 GB" },
            { label: "job", value: "8f21 · mesh-worker-2" },
          ],
        })}
      />,
    );
    expect(screen.getByText("terminal-yard-4.obj · 2.4 GB")).toBeInTheDocument();
    expect(screen.getByText("8f21 · mesh-worker-2")).toBeInTheDocument();
  });

  it("cannot open an unconverted item in the viewer", () => {
    const { rerender } = render(<ContentInspector {...props()} />);
    expect(screen.getByRole("button", { name: "Open in viewer" })).toBeDisabled();

    rerender(<ContentInspector {...props({ item: item({ status: "ready" }) })} />);
    expect(screen.getByRole("button", { name: "Open in viewer" })).toBeEnabled();
  });

  it("offers to cancel only a job that is running", () => {
    const { rerender } = render(<ContentInspector {...props()} />);
    expect(screen.queryByRole("button", { name: "Cancel job" })).not.toBeInTheDocument();

    rerender(<ContentInspector {...props({ onCancelJob: vi.fn() })} />);
    expect(screen.getByRole("button", { name: "Cancel job" })).toBeInTheDocument();
  });

  it("runs the management actions", async () => {
    const p = props({ onCancelJob: vi.fn() });
    render(<ContentInspector {...p} />);

    for (const [name, fn] of [
      ["Replace source", p.onReplaceSource],
      ["Cancel job", p.onCancelJob!],
      ["Delete", p.onDelete],
      ["Close", p.onClose],
    ] as const) {
      await userEvent.click(screen.getByRole("button", { name }));
      expect(fn).toHaveBeenCalledOnce();
    }
  });

  it("hides every management action from a reader who may not manage content", () => {
    render(<ContentInspector {...props({ canManage: false, onCancelJob: vi.fn() })} />);
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("draws Replace source and Delete only when handed a handler", () => {
    render(<ContentInspector {...props({ onReplaceSource: undefined, onDelete: undefined })} />);
    expect(screen.queryByRole("button", { name: "Replace source" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open in viewer" })).toBeInTheDocument();
  });
});
