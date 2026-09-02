import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "./filter-bar";

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
