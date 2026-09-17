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

describe("Segmented · xs", () => {
  it("drops the item side padding for a control that fills a 300px panel", () => {
    const { container } = render(
      <Segmented
        ariaLabel="Gizmo mode"
        size="xs"
        tone="soft"
        value="translate"
        onChange={() => {}}
        items={[
          { value: "translate", label: "Translate T" },
          { value: "rotate", label: "Rotate R" },
        ]}
      />,
    );
    const item = screen.getByRole("radio", { name: "Translate T" });
    expect(item.className).toContain("px-0");
    expect(item.className).toContain("text-[10px]");
    expect(item.className).toContain("font-mono");
    // One padding per axis: no second px/py utility left over from the sm size.
    expect(item.className).not.toContain("px-2");
    expect(item.className).not.toContain("text-[11px]");
    expect(container.firstElementChild!.className).toContain("p-[3px]");
    // "gap-1" contains "p-1" as a substring, so match the whole class.
    expect(container.firstElementChild!.className.split(" ")).not.toContain("p-1");
  });

  it("keeps the roles, the roving keys and the fill of the default size", async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        ariaLabel="Gizmo mode"
        size="xs"
        value="translate"
        onChange={onChange}
        items={[
          { value: "translate", label: "Translate T" },
          { value: "rotate", label: "Rotate R" },
        ]}
      />,
    );
    const item = screen.getByRole("radio", { name: "Translate T" });
    expect(item).toHaveAttribute("aria-checked", "true");
    expect(item.className).toContain("flex-1");
    item.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("rotate");
  });

  // jsdom computes no styles, so the press and the HUD's one focus offset are
  // pinned by their tokens. A disabled segment does not press.
  it("presses an enabled segment and focuses with the 2px offset", () => {
    render(<Harness />);
    const cls = screen.getByRole("radio", { name: /Rotate/ }).className.split(/\s+/);
    expect(cls).toEqual(
      expect.arrayContaining([
        "enabled:active:scale-[0.97]",
        "transition-[color,background-color,scale]",
        "ease-out",
        "focus-visible:outline-offset-2",
      ]),
    );
    expect(cls).not.toContain("focus-visible:outline-offset-1");
  });
});
