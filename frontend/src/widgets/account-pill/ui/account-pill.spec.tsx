import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountPill } from "./account-pill";

describe("AccountPill", () => {
  it("opens the account page and names whose account it is", () => {
    render(<AccountPill username="a.ivanova" roleTitle="Company Owner" />);
    expect(screen.getByRole("link", { name: "Open account for a.ivanova" })).toHaveAttribute(
      "href",
      "/account",
    );
  });

  it("shows the avatar, the username and the role title", () => {
    render(<AccountPill username="a.ivanova" roleTitle="Company Owner" />);
    expect(screen.getByRole("img", { name: "a.ivanova" })).toBeInTheDocument();
    expect(screen.getByText("a.ivanova")).toBeInTheDocument();
    expect(screen.getByText("Company Owner")).toBeInTheDocument();
  });

  // Answers the press, not only the release; the hover border eases with it.
  it("presses on pointer-down", () => {
    render(<AccountPill username="a.ivanova" roleTitle="Company Owner" />);
    expect(screen.getByRole("link", { name: "Open account for a.ivanova" })).toHaveClass("transition-[border-color,scale]", "duration-150", "ease-out", "active:scale-[0.97]");
  });
});
