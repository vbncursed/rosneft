import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./avatar";
import { initials } from "./initials";

describe("initials", () => {
  it("takes the first letter of the first two parts", () => {
    expect(initials("a.ivanova")).toBe("AI");
    expect(initials("Dmitry Smirnov")).toBe("DS");
    expect(initials("guest_viewer")).toBe("GV");
    expect(initials("old-account")).toBe("OA");
  });

  it("falls back to the first two letters of a single word", () => {
    expect(initials("root")).toBe("RO");
    expect(initials("x")).toBe("X");
  });

  it("survives an empty or punctuation-only name", () => {
    expect(initials("")).toBe("?");
    expect(initials("...")).toBe("?");
  });
});

describe("Avatar", () => {
  it("announces the full name, not the initials", () => {
    render(<Avatar name="a.ivanova" />);
    expect(screen.getByRole("img", { name: "a.ivanova" })).toBeInTheDocument();
  });

  it("marks the active identity with the accent fill", () => {
    const { rerender } = render(<Avatar name="d.smirnov" />);
    expect(screen.getByRole("img", { name: "d.smirnov" }).className).toContain("bg-panel-2");

    rerender(<Avatar name="d.smirnov" active />);
    expect(screen.getByRole("img", { name: "d.smirnov" }).className).toContain("bg-accent");
  });

  it("takes the size it is given", () => {
    render(<Avatar name="a.ivanova" size={48} />);
    expect(screen.getByRole("img", { name: "a.ivanova" })).toHaveStyle({ width: "48px" });
  });
});
