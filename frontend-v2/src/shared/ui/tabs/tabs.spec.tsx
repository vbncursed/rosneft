import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Tabs, type Tab } from "./tabs";

type Section = "overview" | "placements" | "documents" | "panoramas";

const TABS: Tab<Section>[] = [
  { value: "overview", label: "Overview" },
  { value: "placements", label: "Placements" },
  { value: "documents", label: "Documents" },
  { value: "panoramas", label: "Panoramas", disabled: true },
];

function Harness({ initial = "overview" as Section }) {
  const [value, setValue] = useState<Section>(initial);
  return (
    <>
      <Tabs tabs={TABS} value={value} onChange={setValue} ariaLabel="Territory sections" />
      <output data-testid="readout">{value}</output>
    </>
  );
}

describe("Tabs", () => {
  it("exposes a tablist with exactly one selected tab", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist", { name: "Territory sections" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Placements" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("switches on click", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("tab", { name: "Documents" }));
    expect(screen.getByTestId("readout")).toHaveTextContent("documents");
  });

  it("keeps only the selected tab in the tab order", () => {
    render(<Harness initial="documents" />);
    expect(screen.getByRole("tab", { name: "Documents" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("tabindex", "-1");
  });

  it("walks with the arrow keys, wrapping past the disabled tab", async () => {
    render(<Harness initial="documents" />);
    screen.getByRole("tab", { name: "Documents" }).focus();

    // Panoramas is disabled, so the next stop wraps to Overview.
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByTestId("readout")).toHaveTextContent("overview");

    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByTestId("readout")).toHaveTextContent("documents");
  });

  it("cannot be moved to a disabled tab by click", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("tab", { name: "Panoramas" }));
    expect(screen.getByTestId("readout")).toHaveTextContent("overview");
  });
});
