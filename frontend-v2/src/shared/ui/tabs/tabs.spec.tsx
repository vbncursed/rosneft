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

describe("Tabs, segments variant", () => {
  function Segments() {
    const [value, setValue] = useState<Section>("overview");
    return (
      <Tabs
        tabs={TABS.slice(0, 2)}
        value={value}
        onChange={setValue}
        ariaLabel="Overlays sections"
        panelId="body"
        variant="segments"
      />
    );
  }

  it("fills the active segment and drops the underline rule", () => {
    render(<Segments />);
    const active = screen.getByRole("tab", { name: "Overview" });
    expect(active).toHaveClass("bg-accent-soft", "text-accent");
    // clsx concatenates: a leftover bg-transparent in the base string would
    // still be in the class list, and source order — not class order — decides
    // which one paints. The fill would silently not appear.
    expect(active.className).not.toContain("bg-transparent");
    expect(active.className).not.toContain("border-b-2");
    expect(screen.getByRole("tablist", { name: "Overlays sections" }).className).not.toContain(
      "border-b",
    );
  });

  it("points the active tab at the panel it drives, and names itself for it", () => {
    render(<Segments />);
    const active = screen.getByRole("tab", { name: "Overview" });
    expect(active).toHaveAttribute("aria-controls", "body");
    expect(active).toHaveAttribute("id", "body-overview");
    // Only the active panel is rendered, so an idle tab controls nothing — but
    // it still carries an id the panel can point back to.
    const idle = screen.getByRole("tab", { name: "Placements" });
    expect(idle).not.toHaveAttribute("aria-controls");
    expect(idle).toHaveAttribute("id", "body-placements");
  });

  it("keeps the tab roles and the arrow-key walk", async () => {
    render(<Segments />);
    screen.getByRole("tab", { name: "Overview" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Placements" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
