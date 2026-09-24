import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TwoFactorRequiredPage } from "./two-factor-required-page";

const props = { username: "a.ivanova", onSignOut: vi.fn(), signingOut: false };

describe("TwoFactorRequiredPage", () => {
  it("gate: says why, lists the three steps, and offers setup and sign-out", async () => {
    render(<TwoFactorRequiredPage {...props} stage="gate" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Set up two-factor to continue" }),
    ).toBeInTheDocument();
    expect(screen.getByText("two-factor required")).toBeInTheDocument();
    const steps = screen.getAllByRole("listitem");
    expect(steps.map((li) => li.querySelector("p")?.textContent)).toEqual([
      "Open an authenticator app",
      "Scan the code and confirm six digits",
      "Save the recovery codes",
    ]);
    expect(screen.getByRole("link", { name: "Set up two-factor" })).toHaveAttribute(
      "href",
      "/account/two-factor",
    );
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(props.onSignOut).toHaveBeenCalled();
  });

  it("done: says it is on and continues to the territories", () => {
    render(<TwoFactorRequiredPage {...props} stage="done" />);
    expect(screen.getByRole("heading", { level: 1, name: "You're all set" })).toBeInTheDocument();
    expect(screen.getByText("two-factor on")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue to territories" })).toHaveAttribute(
      "href",
      "/territories",
    );
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("shows who is signed in, with no menu", () => {
    render(<TwoFactorRequiredPage {...props} stage="gate" />);
    expect(screen.getByText("a.ivanova")).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Theme:/ })).toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("disables sign-out while it runs", () => {
    render(<TwoFactorRequiredPage {...props} stage="gate" signingOut />);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeDisabled();
  });
});
