import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { pipelineSteps } from "../model/pipeline";
import { Pipeline } from "./pipeline";

describe("Pipeline", () => {
  it("is a labelled ordered list of every step, label and token", () => {
    render(<Pipeline steps={pipelineSteps("compressing", "running")} />);
    const list = screen.getByRole("list", { name: "Conversion pipeline" });
    // list-none drops the implicit role in WebKit; the attribute is what keeps it.
    expect(list).toHaveAttribute("role", "list");
    expect(list.tagName).toBe("OL");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(7);
    expect(items[4]).toHaveTextContent("Compressing textures");
    expect(items[4]).toHaveTextContent("compressing");
    expect(items[5]).toHaveTextContent("lod-N");
  });

  it("says each step's state in words — visibly while running or failed, off-screen otherwise", () => {
    render(<Pipeline steps={pipelineSteps("compressing", "running")} />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[4]).getByText("running").className).not.toContain("sr-only");
    expect(within(items[0]).getByText("done").className).toContain("sr-only");
    expect(within(items[6]).getByText("not started").className).toContain("sr-only");
  });

  it("tones the failed step bad and stops the breathing", () => {
    const { container } = render(<Pipeline steps={pipelineSteps("lod-1", "failed")} />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[5]).getByText("failed").className).toContain("text-bad");
    expect(items[5].className).toContain("border-bad");
    expect(container.querySelectorAll(".animate-breathe")).toHaveLength(0);
  });

  it("breathes on exactly the active dot, and mutes a pending label", () => {
    const { container } = render(<Pipeline steps={pipelineSteps("encoding", "running")} />);
    expect(container.querySelectorAll(".animate-breathe")).toHaveLength(1);
    expect(screen.getByText("Registering artifacts").className).toContain("text-muted");
    expect(screen.getByText("Fetching the archive").className).toContain("text-fg");
  });

  it("takes its own name", () => {
    render(<Pipeline steps={pipelineSteps(null, "queued")} label="Steps" />);
    expect(screen.getByRole("list", { name: "Steps" })).toBeInTheDocument();
  });
});
