import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dropdown, type DropdownOption } from "./dropdown";

type Entity = "any" | "territory" | "model" | "placement";

const OPTIONS: DropdownOption<Entity>[] = [
  { value: "any", label: "any" },
  { value: "territory", label: "territory", hint: "12" },
  { value: "model", label: "model", hint: "31" },
  { value: "placement", label: "placement", hint: "locked", disabled: true },
];

function Harness({ initial = "territory" as Entity }) {
  const [value, setValue] = useState<Entity>(initial);
  return (
    <>
      <Dropdown options={OPTIONS} value={value} onChange={setValue} ariaLabel="Entity" />
      <output data-testid="readout">{value}</output>
    </>
  );
}

const trigger = () => screen.getByRole("button", { name: /Entity/ });

describe("Dropdown", () => {
  it("shows the selected label and stays closed until asked", () => {
    render(<Harness />);
    expect(trigger()).toHaveTextContent("territory");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens on click and lists every option", async () => {
    render(<Harness />);
    await userEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(screen.getByRole("option", { name: /territory/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("selects on click and closes", async () => {
    render(<Harness />);
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("option", { name: /model/ }));
    expect(screen.getByTestId("readout")).toHaveTextContent("model");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("refuses a disabled option", async () => {
    render(<Harness />);
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("option", { name: /placement/ }));
    expect(screen.getByTestId("readout")).toHaveTextContent("territory");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("opens and picks from the keyboard, skipping disabled options", async () => {
    render(<Harness initial="model" />);
    trigger().focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    // model -> placement is disabled, so the active option must not move past it.
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByTestId("readout")).toHaveTextContent("model");
  });

  it("moves up the list with the arrow keys", async () => {
    render(<Harness initial="model" />);
    trigger().focus();
    await userEvent.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(screen.getByTestId("readout")).toHaveTextContent("territory");
  });

  it("closes on Escape without changing the value", async () => {
    render(<Harness />);
    await userEvent.click(trigger());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByTestId("readout")).toHaveTextContent("territory");
  });

  it("closes when a pointer lands outside", async () => {
    render(
      <>
        <Harness />
        <button type="button">elsewhere</button>
      </>,
    );
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("never opens while disabled", async () => {
    const onChange = vi.fn();
    render(
      <Dropdown options={OPTIONS} value="any" onChange={onChange} ariaLabel="Entity" disabled />,
    );
    await userEvent.click(trigger());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
