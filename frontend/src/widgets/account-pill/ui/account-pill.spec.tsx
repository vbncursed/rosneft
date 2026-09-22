import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { hoverTip } from "@/shared/ui/tooltip/testing";
import { AccountPill } from "./account-pill";

const pill = (over: { onAccount?: () => void; onSignOut?: () => void } = {}) =>
  render(
    <AccountPill
      username="a.ivanova"
      roleTitle="Company Owner"
      onAccount={over.onAccount ?? vi.fn()}
      onSignOut={over.onSignOut ?? vi.fn()}
    />,
  );

const trigger = () => screen.getByRole("button", { name: "Account menu for a.ivanova" });

describe("AccountPill", () => {
  it("is a menu trigger that names whose account it is", () => {
    pill();
    expect(trigger()).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("shows the avatar, the username and the role title", () => {
    pill();
    expect(within(trigger()).getByRole("img", { name: "a.ivanova" })).toBeInTheDocument();
    expect(within(trigger()).getByText("a.ivanova")).toBeInTheDocument();
    expect(within(trigger()).getByText("Company Owner")).toBeInTheDocument();
  });

  // The pill already shows the name; a tooltip would only repeat it.
  it("draws no tooltip over its own text", () => {
    pill();
    expect(hoverTip(trigger())).toBeNull();
  });

  it("opens an identity card above Account and Sign out", async () => {
    pill();
    await userEvent.click(trigger());
    const menu = screen.getByRole("menu", { name: "Account menu for a.ivanova" });
    expect(within(menu).getByText("a.ivanova")).toBeInTheDocument();
    expect(within(menu).getByText("Company Owner")).toBeInTheDocument();
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Account",
      "Sign out",
    ]);
  });

  it("opens the account page from Account", async () => {
    const onAccount = vi.fn();
    pill({ onAccount });
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("menuitem", { name: "Account" }));
    expect(onAccount).toHaveBeenCalledOnce();
  });

  it("signs out from Sign out", async () => {
    const onSignOut = vi.fn();
    pill({ onSignOut });
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  // Answers the press, not only the release; the hover border eases with it.
  it("presses on pointer-down and marks itself while open", () => {
    pill();
    expect(trigger()).toHaveClass(
      "transition-[border-color,scale]",
      "duration-150",
      "ease-out",
      "active:scale-[0.97]",
      "aria-expanded:border-accent-line",
    );
  });
});
