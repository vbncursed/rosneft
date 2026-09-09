import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./avatar";


describe("Avatar", () => {
  it("announces the full name, not the initials", () => {
    render(<Avatar name="a.ivanova" />);
    expect(screen.getByRole("img", { name: "a.ivanova" })).toBeInTheDocument();
  });

  it("draws the three variants the design uses", () => {
    const { rerender } = render(<Avatar name="d.smirnov" />);
    expect(screen.getByRole("img", { name: "d.smirnov" }).className).toContain("bg-panel-2");

    rerender(<Avatar name="d.smirnov" variant="solid" />);
    expect(screen.getByRole("img", { name: "d.smirnov" }).className).toContain("bg-accent ");

    rerender(<Avatar name="d.smirnov" variant="soft" />);
    const cls = screen.getByRole("img", { name: "d.smirnov" }).className;
    expect(cls).toContain("bg-accent-soft");
    expect(cls).toContain("text-accent");
  });

  it("takes the size it is given", () => {
    render(<Avatar name="a.ivanova" size={48} />);
    expect(screen.getByRole("img", { name: "a.ivanova" })).toHaveStyle({ width: "48px" });
  });
});
