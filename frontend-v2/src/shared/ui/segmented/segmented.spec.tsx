import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Segmented, type SegmentedItem } from "./segmented";

type Mode = "translate" | "rotate" | "scale";

const ITEMS: SegmentedItem<Mode>[] = [
  { value: "translate", label: "Move", hint: "T" },
  { value: "rotate", label: "Rotate", hint: "R" },
  { value: "scale", label: "Scale", hint: "S" },
];

function Harness({ initial = "translate" as Mode, items = ITEMS }) {
  const [value, setValue] = useState<Mode>(initial);
  return (
    <>
      <Segmented items={items} value={value} onChange={setValue} ariaLabel="Gizmo mode" />
      <output data-testid="readout">{value}</output>
    </>
  );
}

describe("Segmented", () => {
  it("exposes a radiogroup with one checked option", () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "Gizmo mode" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Move/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Rotate/ })).not.toBeChecked();
  });

  it("switches on click", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("radio", { name: /Scale/ }));
    expect(screen.getByTestId("readout")).toHaveTextContent("scale");
    expect(screen.getByRole("radio", { name: /Scale/ })).toBeChecked();
  });

  it("walks the group with the arrow keys and wraps around", async () => {
    render(<Harness />);
    screen.getByRole("radio", { name: /Move/ }).focus();

    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByTestId("readout")).toHaveTextContent("rotate");

    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByTestId("readout")).toHaveTextContent("translate");

    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByTestId("readout")).toHaveTextContent("scale");
  });

  it("keeps only the checked option in the tab order", () => {
    render(<Harness initial="rotate" />);
    expect(screen.getByRole("radio", { name: /Rotate/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: /Move/ })).toHaveAttribute("tabindex", "-1");
  });

  it("skips a disabled segment when arrowing", async () => {
    const items: SegmentedItem<Mode>[] = [
      { value: "translate", label: "Move" },
      { value: "rotate", label: "Rotate", disabled: true },
      { value: "scale", label: "Scale" },
    ];
    render(<Harness items={items} />);
    screen.getByRole("radio", { name: "Move" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByTestId("readout")).toHaveTextContent("scale");
  });
});

describe("Segmented · mono", () => {
  it("sets its labels in mono when asked", () => {
    render(
      <Segmented
        ariaLabel="Range"
        mono
        value="6h"
        onChange={() => {}}
        items={[{ value: "6h", label: "6h" }, { value: "24h", label: "24h" }]}
      />,
    );
    expect(screen.getByRole("radio", { name: "6h" }).className).toContain("font-mono");
  });

  it("stays sans by default", () => {
    render(
      <Segmented
        ariaLabel="Range"
        value="6h"
        onChange={() => {}}
        items={[{ value: "6h", label: "6h" }]}
      />,
    );
    expect(screen.getByRole("radio", { name: "6h" }).className).not.toContain("font-mono");
  });
});
