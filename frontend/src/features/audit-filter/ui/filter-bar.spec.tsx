import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "./filter-bar";
import { hoverTip } from "@/shared/ui/tooltip/testing";

function Harness({ initial = "" }: { initial?: string }) {
  const [query, setQuery] = useState(initial);
  return (
    <>
      <FilterBar query={query} onChange={setQuery} />
      <output data-testid="readout">{query}</output>
    </>
  );
}

const field = () => screen.getByRole("textbox", { name: "Filter events" });

describe("FilterBar", () => {
  it("shows the syntax it expects as a placeholder", () => {
    render(<Harness />);
    expect(field()).toHaveAttribute(
      "placeholder",
      "filter: entity:territory actor:a.ivanova failed:true",
    );
  });

  it("reports what is typed", async () => {
    render(<Harness />);
    await userEvent.type(field(), "refinery");
    expect(screen.getByTestId("readout")).toHaveTextContent("refinery");
  });

  it("shows one chip per key:value token", () => {
    render(<Harness initial="entity:territory actor:a.ivanova" />);
    expect(screen.getByText("entity:territory")).toBeInTheDocument();
    expect(screen.getByText("actor:a.ivanova")).toBeInTheDocument();
  });

  it("shows no chip for free text", () => {
    render(<Harness initial="refinery" />);
    expect(screen.queryByRole("button", { name: /Remove filter/ })).not.toBeInTheDocument();
  });

  it("removes one filter without disturbing the others", async () => {
    render(<Harness initial="entity:territory actor:a.ivanova failed:true" />);
    await userEvent.click(screen.getByRole("button", { name: "Remove filter actor:a.ivanova" }));
    expect(screen.getByTestId("readout")).toHaveTextContent("entity:territory failed:true");
  });

  it("focuses the field on Cmd+K", async () => {
    render(<Harness />);
    expect(field()).not.toHaveFocus();

    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(field()).toHaveFocus();
  });

  it("focuses on Ctrl+K too, for anyone not on a Mac", async () => {
    render(<Harness />);
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(field()).toHaveFocus();
  });

  it("leaves a plain k alone, so the shortcut does not eat typing", async () => {
    const onChange = vi.fn();
    render(<FilterBar query="" onChange={onChange} />);
    await userEvent.keyboard("k");
    expect(field()).not.toHaveFocus();
  });

  it("hides the shortcut chip from assistive tech", () => {
    render(<Harness />);
    expect(screen.getByText("⌘K")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("FilterBar · chips the parser does not own", () => {
  it("shows an extra chip alongside the parsed ones", () => {
    render(
      <FilterBar
        query="entity:territory"
        onChange={vi.fn()}
        extra={[{ label: "last 7 days", onRemove: vi.fn() }]}
      />,
    );
    expect(screen.getByText("entity:territory")).toBeInTheDocument();
    expect(screen.getByText("last 7 days")).toBeInTheDocument();
  });

  it("removes an extra chip through its own handler, leaving the query alone", async () => {
    const onRemove = vi.fn();
    const onChange = vi.fn();
    render(
      <FilterBar query="entity:territory" onChange={onChange} extra={[{ label: "last 7 days", onRemove }]} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove filter last 7 days" }));
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows none when there are none", () => {
    render(<FilterBar query="" onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Remove filter/ })).not.toBeInTheDocument();
  });

  // Focus lands in one frame (no transition on the focus-within border);
  // the chips' × eases its hover and answers the press.
  it("focuses instantly and presses a chip's remove glyph", () => {
    render(<Harness initial="entity:territory" />);
    const box = field().parentElement!;
    expect(box).toHaveClass("focus-within:border-accent");
    expect(box.className).not.toMatch(/\btransition/);
    expect(screen.getByRole("button", { name: "Remove filter entity:territory" })).toHaveClass("transition-[color,scale]", "duration-150", "ease-out", "active:scale-95");
  });
});

describe("FilterBar · remove marks", () => {
  it("draws each chip's remove button as an icon, not a × character", () => {
    render(
      <FilterBar
        query="entity:territory"
        onChange={() => {}}
        extra={[{ label: "from:2026-08-01", onRemove: () => {} }]}
      />,
    );
    for (const name of ["Remove filter entity:territory", "Remove filter from:2026-08-01"]) {
      const remove = screen.getByRole("button", { name });
      expect(remove.querySelector("svg")).not.toBeNull();
      expect(remove.textContent).toBe("");
    }
  });
});

describe("FilterBar · tooltip", () => {
  it("names each chip's remove button in a tooltip", () => {
    render(<FilterBar query="entity:territory" onChange={vi.fn()} extra={[{ label: "last 7 days", onRemove: vi.fn() }]} />);
    const parsed = screen.getByRole("button", { name: "Remove filter entity:territory" });
    expect(hoverTip(parsed)).toHaveTextContent("Remove filter entity:territory");
    fireEvent.pointerLeave(parsed, { pointerType: "mouse" });
    const extra = screen.getByRole("button", { name: "Remove filter last 7 days" });
    expect(hoverTip(extra)).toHaveTextContent("Remove filter last 7 days");
  });
});
