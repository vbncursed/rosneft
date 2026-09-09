import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthSteps, type AuthStep } from "./auth-steps";

const STEPS: AuthStep[] = [
  { key: "creds", label: "1 · identity" },
  { key: "2fa", label: "2 · second factor" },
];

describe("AuthSteps", () => {
  it("is an ordered, labelled list of the steps", () => {
    render(<AuthSteps steps={STEPS} current="creds" />);
    expect(screen.getByRole("list", { name: "Sign-in progress" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("marks the step being worked on", () => {
    render(<AuthSteps steps={STEPS} current="2fa" />);
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[0]).not.toHaveAttribute("aria-current");
  });

  it("says a passed step is completed, rather than leaving it to the colour", () => {
    render(<AuthSteps steps={STEPS} current="2fa" />);
    expect(screen.getByText("completed")).toBeInTheDocument();
  });

  it("colours the three states apart", () => {
    const { rerender } = render(<AuthSteps steps={STEPS} current="creds" />);
    let items = screen.getAllByRole("listitem");
    expect(items[0].className).toContain("text-accent");
    expect(items[1].className).toContain("text-dim");

    rerender(<AuthSteps steps={STEPS} current="2fa" />);
    items = screen.getAllByRole("listitem");
    expect(items[0].className).toContain("text-ok");
    expect(items[1].className).toContain("text-accent");
  });

  it("marks nothing current for an unknown step", () => {
    render(<AuthSteps steps={STEPS} current="nowhere" />);
    expect(screen.queryByRole("listitem", { current: "step" })).not.toBeInTheDocument();
  });
});
