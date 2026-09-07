import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepChips } from "./step-chips";

const ENABLE = [
  { label: "1 · scan", tone: "done" as const },
  { label: "2 · confirm", tone: "active" as const },
  { label: "3 · save codes", tone: "pending" as const },
];

describe("StepChips", () => {
  it("lists every step in order under one named sequence", () => {
    render(<StepChips steps={ENABLE} />);
    expect(
      screen.getAllByRole("listitem").map((li) => li.textContent?.replace(/completed$/, "")),
    ).toEqual(["1 · scan", "2 · confirm", "3 · save codes"]);
    expect(screen.getByRole("list", { name: "Two-factor progress" })).toBeInTheDocument();
  });

  // Two steps can be active at once here — the scan and confirm panes are on
  // screen together — so the tone is read per chip, never derived from an index.
  it("marks every active chip as the current step, not only the first", () => {
    render(
      <StepChips
        steps={[
          { label: "1 · scan", tone: "active" },
          { label: "2 · confirm", tone: "active" },
          { label: "3 · save codes", tone: "pending" },
        ]}
      />,
    );
    const current = screen.getAllByRole("listitem").filter((li) => li.getAttribute("aria-current"));
    expect(current.map((li) => li.textContent)).toEqual(["1 · scan", "2 · confirm"]);
  });

  // Colour alone would leave a done step and a pending one identical to a
  // screen reader.
  it("says 'completed' off-screen on a finished step and nothing on a waiting one", () => {
    render(<StepChips steps={ENABLE} />);
    const [scan, , codes] = screen.getAllByRole("listitem");
    expect(scan).toHaveTextContent("completed");
    expect(codes).not.toHaveTextContent("completed");
    expect(codes).not.toHaveAttribute("aria-current");
    // A finished step is not the step you are on. Announcing it as current is
    // the false announcement that kept this off widgets/auth-steps.
    expect(scan).not.toHaveAttribute("aria-current");
  });

  it("dresses the three tones as the design does", () => {
    render(<StepChips steps={ENABLE} />);
    const [scan, confirm, codes] = screen.getAllByRole("listitem");
    expect(scan!.className).toContain("text-ok");
    expect(confirm!.className).toContain("bg-accent-soft");
    expect(codes!.className).toContain("text-muted");
  });
});
