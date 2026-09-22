import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DatePicker } from "./date-picker";
import { hoverTip } from "@/shared/ui/tooltip/testing";

function Harness({ initial = "2026-08-24" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DatePicker label="From" value={value} onChange={setValue} today="2026-08-31" />
      <output data-testid="readout">{value}</output>
    </>
  );
}

const field = () => screen.getByRole("button", { name: "From" });

describe("DatePicker", () => {
  it("shows the chosen date and keeps the calendar closed", () => {
    render(<Harness />);
    expect(field()).toHaveTextContent("2026-08-24");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a placeholder when nothing is chosen", () => {
    render(<Harness initial="" />);
    expect(field()).toHaveTextContent("yyyy-mm-dd");
  });

  it("opens on the month of the chosen date", async () => {
    render(<Harness />);
    await userEvent.click(field());
    expect(screen.getByRole("dialog", { name: "From" })).toBeInTheDocument();
    expect(screen.getByText("August 2026")).toBeInTheDocument();
  });

  it("marks the selected day and today distinctly", async () => {
    render(<Harness />);
    await userEvent.click(field());
    expect(screen.getByRole("button", { name: "24 August 2026" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "31 August 2026" })).toHaveAttribute(
      "aria-current",
      "date",
    );
  });

  it("picks a day and closes", async () => {
    render(<Harness />);
    await userEvent.click(field());
    await userEvent.click(screen.getByRole("button", { name: "12 August 2026" }));

    expect(screen.getByTestId("readout")).toHaveTextContent("2026-08-12");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("steps between months, rolling over the year", async () => {
    render(<Harness initial="2026-12-10" />);
    await userEvent.click(field());
    expect(screen.getByText("December 2026")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("January 2027")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("November 2026")).toBeInTheDocument();
  });

  it("offers one button per day of the month, each naming its full date", async () => {
    render(<Harness />);
    await userEvent.click(field());
    // 31 days + prev/next month + the field itself.
    expect(screen.getByRole("button", { name: "1 August 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "31 August 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "32 August 2026" })).not.toBeInTheDocument();
  });

  it("gives the calendar a width of its own, so the grid cannot collapse", async () => {
    render(<Harness />);
    await userEvent.click(field());
    expect(screen.getByRole("dialog").className).toMatch(/w-\[17\.5rem\]/);
  });

  it("draws square day cells rather than letting the digits size them", async () => {
    render(<Harness />);
    await userEvent.click(field());
    expect(screen.getByRole("button", { name: "12 August 2026" }).className).toContain(
      "aspect-square",
    );
  });

  it("closes on Escape without changing the value", async () => {
    render(<Harness />);
    await userEvent.click(field());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("readout")).toHaveTextContent("2026-08-24");
  });

  it("never opens while disabled", async () => {
    render(<DatePicker label="From" value="2026-08-24" onChange={() => {}} disabled />);
    await userEvent.click(field());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("anchors the calendar to the trigger's left edge by default, and to its right on align=end", async () => {
    const { unmount } = render(<Harness />);
    await userEvent.click(field());
    expect(screen.getByRole("dialog").className).toContain("left-0");
    unmount();
    render(<DatePicker label="To" value="" onChange={() => {}} align="end" />);
    await userEvent.click(screen.getByRole("button", { name: "To" }));
    expect(screen.getByRole("dialog").className).toContain("right-0");
  });
});

describe("DatePicker · focus return", () => {
  it("hands focus back to the field after a day is picked", async () => {
    render(<Harness />);
    await userEvent.click(field());
    screen.getByRole("button", { name: "12 August 2026" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(field()).toHaveFocus();
  });

  it("hands focus back to the field after Escape", async () => {
    render(<Harness />);
    await userEvent.click(field());
    screen.getByRole("button", { name: "Next month" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(field()).toHaveFocus();
  });
});

describe("DatePicker · states", () => {
  it("gives the month arrows a 24px target and every day press feedback", async () => {
    render(<Harness />);
    await userEvent.click(field());
    const prev = screen.getByRole("button", { name: "Previous month" });
    expect(prev.classList).toContain("size-6");
    expect(prev.classList).toContain("active:scale-[0.95]");
    const day = screen.getByRole("button", { name: "12 August 2026" });
    expect(day.classList).toContain("active:scale-[0.95]");
    expect(day.classList).toContain("hover:border-line-2");
  });

  it("grows the calendar out of the edge it hangs from", async () => {
    render(<Harness />);
    await userEvent.click(field());
    const calendar = screen.getByRole("dialog");
    expect(calendar.classList).toContain("origin-top-left");
    expect(calendar.classList).toContain("starting:opacity-0");
  });
});

describe("DatePicker · month arrows", () => {
  it("draws the month arrows as chevrons, not ← → characters", async () => {
    render(<Harness />);
    await userEvent.click(field());
    for (const name of ["Previous month", "Next month"]) {
      const arrow = screen.getByRole("button", { name });
      expect(arrow.querySelector("svg")).not.toBeNull();
      expect(arrow.textContent).toBe("");
    }
  });
});

describe("DatePicker · tooltips", () => {
  it("names the month arrows in tooltips", async () => {
    render(<Harness />);
    await userEvent.click(field());
    expect(hoverTip(screen.getByRole("button", { name: "Previous month" }))).toHaveTextContent("Previous month");
    fireEvent.pointerLeave(screen.getByRole("button", { name: "Previous month" }), { pointerType: "mouse" });
    expect(hoverTip(screen.getByRole("button", { name: "Next month" }))).toHaveTextContent("Next month");
  });
});
