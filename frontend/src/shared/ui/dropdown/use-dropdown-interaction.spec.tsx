import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Dropdown, type DropdownOption } from "./dropdown";

type Entity = "any" | "territory" | "model" | "placement";

const OPTIONS: DropdownOption<Entity>[] = [
  { value: "any", label: "any" },
  { value: "territory", label: "territory", hint: "12" },
  { value: "model", label: "model", hint: "31" },
  { value: "placement", label: "placement", hint: "locked", disabled: true },
];

const trigger = () => screen.getByRole("button", { name: /Entity/ });

it("reconciles the active option when an open list shrinks", async () => {
  const onChange = vi.fn();
  const { rerender } = render(<Dropdown options={OPTIONS} value="model" onChange={onChange} ariaLabel="Entity" />);
  await userEvent.click(trigger());
  rerender(<Dropdown options={OPTIONS.slice(0, 2)} value="model" onChange={onChange} ariaLabel="Entity" />);
  const list = screen.getByRole("listbox");
  expect(list).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: "any" }).id);
  await userEvent.keyboard("{Enter}");
  expect(onChange).toHaveBeenCalledWith("any");
});

it("keeps the active option by value when the open list is reordered", async () => {
  const onChange = vi.fn();
  const { rerender } = render(<Dropdown options={OPTIONS} value="model" onChange={onChange} ariaLabel="Entity" />);
  await userEvent.click(trigger());
  rerender(
    <Dropdown options={[OPTIONS[2], OPTIONS[0], OPTIONS[1]]} value="model" onChange={onChange} ariaLabel="Entity" />,
  );
  expect(screen.getByRole("listbox")).toHaveAttribute(
    "aria-activedescendant",
    screen.getByRole("option", { name: /model/ }).id,
  );
  await userEvent.keyboard("{Enter}");
  expect(onChange).toHaveBeenCalledWith("model");
});

it("uses the first enabled option when the active option becomes disabled", async () => {
  const onChange = vi.fn();
  const { rerender } = render(<Dropdown options={OPTIONS} value="model" onChange={onChange} ariaLabel="Entity" />);
  await userEvent.click(trigger());
  rerender(
    <Dropdown
      options={[OPTIONS[0], { ...OPTIONS[2], disabled: true }]}
      value="model"
      onChange={onChange}
      ariaLabel="Entity"
    />,
  );
  expect(screen.getByRole("listbox")).toHaveAttribute(
    "aria-activedescendant",
    screen.getByRole("option", { name: "any" }).id,
  );
  await userEvent.keyboard("{Enter}");
  expect(onChange).toHaveBeenCalledWith("any");
});

it("has no active descendant or selection when all options disappear or are disabled", async () => {
  const onChange = vi.fn();
  const { rerender } = render(<Dropdown options={OPTIONS} value="model" onChange={onChange} ariaLabel="Entity" />);
  await userEvent.click(trigger());
  rerender(<Dropdown options={[OPTIONS[3]]} value="model" onChange={onChange} ariaLabel="Entity" />);
  expect(screen.getByRole("listbox")).not.toHaveAttribute("aria-activedescendant");
  await userEvent.keyboard("{Enter}{ArrowDown}{ArrowUp}");
  rerender(<Dropdown options={[]} value="model" onChange={onChange} ariaLabel="Entity" />);
  expect(screen.getByRole("listbox")).not.toHaveAttribute("aria-activedescendant");
  await userEvent.keyboard("{Enter}{ArrowDown}{ArrowUp}");
  expect(onChange).not.toHaveBeenCalled();
});

it("moves from a disabled placeholder to the first enabled option with ArrowDown", async () => {
  const onChange = vi.fn();
  render(
    <Dropdown
      options={[{ value: "", label: "Choose", disabled: true }, OPTIONS[0], OPTIONS[1]]}
      value=""
      onChange={onChange}
      ariaLabel="Entity"
    />,
  );
  trigger().focus();
  await userEvent.keyboard("{ArrowDown}");
  expect(screen.getByRole("listbox")).not.toHaveAttribute("aria-activedescendant");
  await userEvent.keyboard("{Enter}");
  expect(onChange).not.toHaveBeenCalled();
  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(onChange).toHaveBeenCalledWith("any");
});

it("navigates from the visible fallback after the active option becomes disabled", async () => {
  const onChange = vi.fn();
  const { rerender } = render(<Dropdown options={OPTIONS} value="model" onChange={onChange} ariaLabel="Entity" />);
  await userEvent.click(trigger());
  rerender(
    <Dropdown
      options={[OPTIONS[0], OPTIONS[1], { ...OPTIONS[2], disabled: true }]}
      value="model"
      onChange={onChange}
      ariaLabel="Entity"
    />,
  );
  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(onChange).toHaveBeenCalledWith("territory");
});

it.each([
  ["ArrowUp", "any"],
  ["ArrowDown", "model"],
])("navigates %s from a disabled selected option in the middle", async (key, expected) => {
  const onChange = vi.fn();
  render(
    <Dropdown
      options={[OPTIONS[0], { ...OPTIONS[1], disabled: true }, OPTIONS[2]]}
      value="territory"
      onChange={onChange}
      ariaLabel="Entity"
    />,
  );
  await userEvent.click(trigger());
  expect(screen.getByRole("listbox")).not.toHaveAttribute("aria-activedescendant");
  await userEvent.keyboard(`{${key}}{Enter}`);
  expect(onChange).toHaveBeenCalledWith(expected);
});

it("reconciles an initially disabled option that becomes enabled then disabled", async () => {
  const onChange = vi.fn();
  const disabled = [OPTIONS[0], { ...OPTIONS[1], disabled: true }];
  const { rerender } = render(<Dropdown options={disabled} value="territory" onChange={onChange} ariaLabel="Entity" />);
  await userEvent.click(trigger());
  rerender(<Dropdown options={OPTIONS.slice(0, 2)} value="territory" onChange={onChange} ariaLabel="Entity" />);
  expect(screen.getByRole("listbox")).toHaveAttribute(
    "aria-activedescendant",
    screen.getByRole("option", { name: /territory/ }).id,
  );
  rerender(<Dropdown options={disabled} value="territory" onChange={onChange} ariaLabel="Entity" />);
  expect(screen.getByRole("listbox")).toHaveAttribute(
    "aria-activedescendant",
    screen.getByRole("option", { name: "any" }).id,
  );
  await userEvent.keyboard("{Enter}");
  expect(onChange).toHaveBeenCalledWith("any");
});

it("keeps the fallback when a removed active option returns", async () => {
  const onChange = vi.fn();
  const { rerender } = render(<Dropdown options={OPTIONS} value="model" onChange={onChange} ariaLabel="Entity" />);
  await userEvent.click(trigger());
  rerender(<Dropdown options={OPTIONS.slice(0, 2)} value="model" onChange={onChange} ariaLabel="Entity" />);
  rerender(<Dropdown options={OPTIONS} value="model" onChange={onChange} ariaLabel="Entity" />);
  expect(screen.getByRole("listbox")).toHaveAttribute(
    "aria-activedescendant",
    screen.getByRole("option", { name: "any" }).id,
  );
  await userEvent.keyboard("{Enter}");
  expect(onChange).toHaveBeenCalledWith("any");
});

it("reopens at the latest controlled selection after navigating without choosing", async () => {
  const onChange = vi.fn();
  const { rerender } = render(<Dropdown options={OPTIONS} value="any" onChange={onChange} ariaLabel="Entity" />);
  await userEvent.click(trigger());
  await userEvent.keyboard("{ArrowDown}{Escape}");
  rerender(<Dropdown options={OPTIONS} value="model" onChange={onChange} ariaLabel="Entity" />);
  await userEvent.keyboard("{Enter}");
  expect(screen.getByRole("listbox")).toHaveAttribute(
    "aria-activedescendant",
    screen.getByRole("option", { name: /model/ }).id,
  );
  expect(onChange).not.toHaveBeenCalled();
});

it("keeps the active option when the pointer enters a disabled option", async () => {
  const onChange = vi.fn();
  render(<Dropdown options={OPTIONS} value="any" onChange={onChange} ariaLabel="Entity" />);
  await userEvent.click(trigger());
  await userEvent.hover(screen.getByRole("option", { name: /model/ }));
  await userEvent.hover(screen.getByRole("option", { name: /placement/ }));
  expect(screen.getByRole("listbox")).toHaveAttribute(
    "aria-activedescendant",
    screen.getByRole("option", { name: /model/ }).id,
  );
  await userEvent.keyboard("{Enter}");
  expect(onChange).toHaveBeenCalledWith("model");
});
