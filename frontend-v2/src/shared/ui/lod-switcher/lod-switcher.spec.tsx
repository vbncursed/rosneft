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

  it("moves with the arrow keys", async () => {
    const onChange = vi.fn();
    render(<LodSwitcher levels={[0, 1, 2]} target={1} shown={1} onChange={onChange} />);
    screen.getByRole("radio", { name: "LOD 1" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
