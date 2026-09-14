import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SearchField } from "./search-field";

function Harness() {
  const [value, setValue] = useState("");
  return (
    <>
      <SearchField value={value} onChange={setValue} label="Search content" placeholder="title or slug" />
      <output data-testid="readout">{value}</output>
    </>
  );
}

describe("SearchField", () => {
  it("is named for assistive tech without a visible label", () => {
    render(<Harness />);
    expect(screen.getByRole("searchbox", { name: "Search content" })).toBeInTheDocument();
  });

  it("shows the placeholder it was given", () => {
    render(<Harness />);
    expect(screen.getByRole("searchbox")).toHaveAttribute("placeholder", "title or slug");
  });

  it("reports what is typed", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByRole("searchbox"), "refinery");
    expect(screen.getByTestId("readout")).toHaveTextContent("refinery");
  });

  it("is a search input, so the browser offers to clear it", () => {
    render(<Harness />);
    expect(screen.getByRole("searchbox")).toHaveAttribute("type", "search");
  });

  it("keeps distinct ids for two fields on one page", () => {
    render(
      <>
        <SearchField value="" onChange={vi.fn()} label="One" />
        <SearchField value="" onChange={vi.fn()} label="Two" />
      </>,
    );
    expect(screen.getByRole("searchbox", { name: "One" }).id).not.toBe(
      screen.getByRole("searchbox", { name: "Two" }).id,
    );
  });
});
