import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LodSwitcher } from "./lod-switcher";

describe("LodSwitcher", () => {
  it("is a radiogroup with the target checked", () => {
    render(<LodSwitcher levels={[0, 1, 2]} target={1} shown={1} onChange={vi.fn()} />);
    expect(screen.getByRole("radiogroup", { name: "Level of detail" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "LOD 1" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "LOD 0" })).toHaveAttribute("aria-checked", "false");
  });

  it("says which level is on screen while the target loads", () => {
    render(<LodSwitcher levels={[0, 1, 2]} target={0} shown={2} onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "LOD 0, loading" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "LOD 2, on screen" })).toHaveAttribute("data-shown", "true");
  });

  it("reports the chosen level", async () => {
    const onChange = vi.fn();
    render(<LodSwitcher levels={[0, 1, 2]} target={0} shown={0} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "LOD 2" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  // Every level is a multi-megabyte download, so walking the group with the
  // arrows only moves focus; Space or Enter is the choice.
  it("moves focus with the arrow keys and chooses only on Space or Enter", async () => {
    const onChange = vi.fn();
    render(<LodSwitcher levels={[0, 1, 2]} target={1} shown={1} onChange={onChange} />);
    screen.getByRole("radio", { name: "LOD 1" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "LOD 2" })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "LOD 0" })).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenCalledWith(0);

    await userEvent.keyboard("{ArrowLeft}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  // The loading phase used to add a 1px border and an in-flow dot, so the
  // tiles grew and the group shifted on the switcher's most frequent action.
  it("keeps every tile's geometry through the loading phase", () => {
    render(<LodSwitcher levels={[0, 1, 2]} target={0} shown={2} onChange={vi.fn()} />);
    const tiles = screen.getAllByRole("radio");
    for (const tile of tiles) {
      const cls = tile.className.split(/\s+/);
      expect(cls).toContain("border-none");
      expect(cls).not.toContain("border");
      expect(cls).toContain("relative");
    }
    expect(screen.getByRole("radio", { name: "LOD 2, on screen" }).className).toContain("ring-inset");
    const dot = screen.getByRole("radio", { name: "LOD 0, loading" }).querySelector("span[aria-hidden]")!;
    expect(dot.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["absolute", "animate-breathe", "motion-reduce:animate-none"]),
    );
  });

  it("presses a tile, and focuses with the HUD's 2px offset", () => {
    render(<LodSwitcher levels={[0, 1]} target={0} shown={0} onChange={vi.fn()} />);
    const cls = screen.getByRole("radio", { name: "LOD 1" }).className.split(/\s+/);
    expect(cls).toEqual(
      expect.arrayContaining([
        "active:scale-95",
        "transition-[color,background-color,box-shadow,scale]",
        "ease-out",
        "focus-visible:outline-offset-2",
      ]),
    );
  });

  // Roving tabindex: the group is one Tab stop, and the stop follows focus.
  // After an arrow, Tab and Shift+Tab both leave the group; once focus is
  // gone, the stop falls back to the chosen level.
  it("stays a single Tab stop after the arrows move focus", async () => {
    render(
      <>
        <button type="button">before</button>
        <LodSwitcher levels={[0, 1, 2]} target={1} shown={1} onChange={vi.fn()} />
        <button type="button">after</button>
      </>,
    );
    const lod = (n: number) => screen.getByRole("radio", { name: `LOD ${n}` });

    await userEvent.tab();
    await userEvent.tab();
    expect(lod(1)).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(lod(2)).toHaveAttribute("tabindex", "0");
    expect(lod(1)).toHaveAttribute("tabindex", "-1");
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "before" })).toHaveFocus();
    expect(lod(1)).toHaveAttribute("tabindex", "0");
    expect(lod(2)).toHaveAttribute("tabindex", "-1");

    await userEvent.tab();
    expect(lod(1)).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(lod(0)).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "after" })).toHaveFocus();
  });

  // The mock leaves 6px between the label and the dot. Every tile carries the
  // same right-hand reserve, so no phase changes a tile's width.
  it("leaves 6px between the label and the dot, with the same reserve on every tile", () => {
    render(<LodSwitcher levels={[0, 1, 2]} target={0} shown={2} onChange={vi.fn()} />);
    for (const tile of screen.getAllByRole("radio")) {
      const cls = tile.className.split(/\s+/);
      expect(cls).toEqual(expect.arrayContaining(["pl-2.5", "pr-[21px]"]));
      expect(cls).not.toContain("px-2.5");
    }
    // 21px reserve − 10px outer padding − 5px dot = 6px gap after the label.
    const dot = screen.getByRole("radio", { name: "LOD 0, loading" }).querySelector("span[aria-hidden]")!;
    expect(dot.className.split(/\s+/)).toEqual(expect.arrayContaining(["right-2.5", "size-[5px]"]));
  });
});
