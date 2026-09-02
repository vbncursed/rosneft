import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { RadioCards, type RadioCardOption } from "./radio-card";

type Vis = "assigned" | "company" | "private";

const OPTIONS: RadioCardOption<Vis>[] = [
  { value: "assigned", title: "Assigned people", hint: "Only listed accounts can open this." },
  { value: "company", title: "Whole company", hint: "Every account gets read access." },
  { value: "private", title: "Owner only", hint: "Hidden from the catalog." },
];

function Harness({ initial = "assigned" as Vis, options = OPTIONS }) {
  const [value, setValue] = useState<Vis>(initial);
  return (
    <>
      <RadioCards options={options} value={value} onChange={setValue} label="Visibility" />
      <output data-testid="readout">{value}</output>
    </>
  );
}

describe("RadioCards", () => {
  it("is a labelled radiogroup with one option checked", () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "Visibility" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Assigned people/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Whole company/ })).not.toBeChecked();
  });

  it("shows each option's explanation", () => {
    render(<Harness />);
    expect(screen.getByText("Every account gets read access.")).toBeInTheDocument();
  });

  it("chooses on click", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("radio", { name: /Owner only/ }));
    expect(screen.getByTestId("readout")).toHaveTextContent("private");
  });

  it("moves with the arrow keys, as a radiogroup should", async () => {
    render(<Harness />);
    screen.getByRole("radio", { name: /Assigned people/ }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByTestId("readout")).toHaveTextContent("company");
  });

  it("refuses a disabled option", async () => {
    const onChange = vi.fn();
    render(
      <RadioCards
        options={[OPTIONS[0], { ...OPTIONS[1], disabled: true }]}
        value="assigned"
        onChange={onChange}
        label="Visibility"
      />,
    );
    const disabled = screen.getByRole("radio", { name: /Whole company/ });
    expect(disabled).toBeDisabled();
    await userEvent.click(disabled);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps two groups on one page independent", () => {
    render(
      <>
        <Harness />
        <Harness initial="private" />
      </>,
    );
    const names = screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).name);
    expect(new Set(names).size).toBe(2);
  });
});
