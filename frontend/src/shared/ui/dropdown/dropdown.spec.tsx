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
    expect(screen.getByRole("option", { name: /territory/ })).toHaveAttribute("aria-selected", "true");
  });

  // A drawn check on the chosen option; the others keep an empty box of the
  // same width so their labels line up with it.
  it("marks the selected option with a check and leaves the rest an empty slot", async () => {
    render(<Harness />);
    await userEvent.click(trigger());
    const marker = (name: RegExp) => screen.getByRole("option", { name }).firstElementChild!;
    expect(marker(/territory/).querySelector("svg")).not.toBeNull();
    expect(marker(/model/).querySelector("svg")).toBeNull();
    expect(marker(/model/)).toBeEmptyDOMElement();
    expect(marker(/model/).className).toBe(marker(/territory/).className);
    expect(screen.getByRole("listbox")).not.toHaveTextContent(/[●○]/);
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
    render(<Dropdown options={OPTIONS} value="any" onChange={onChange} ariaLabel="Entity" disabled />);
    await userEvent.click(trigger());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("Dropdown · focus return", () => {
  it("keeps focus on the trigger after an option is clicked", async () => {
    render(<Harness />);
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("option", { name: /model/ }));
    expect(trigger()).toHaveFocus();
  });
});

describe("Dropdown · states", () => {
  it("rings the keyboard-active option in accent, the selected one included", async () => {
    render(<Harness />);
    trigger().focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: /territory/ }).classList).toContain("outline-accent");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: /model/ }).classList).toContain("outline-accent");
    expect(screen.getByRole("option", { name: /territory/ }).classList).not.toContain("outline-accent");
  });

  it("turns one arrow glyph instead of swapping it, and drops the list from the trigger", async () => {
    render(<Harness />);
    // A drawn chevron, not the ▾ character it replaced.
    const arrow = trigger().querySelector("[aria-hidden]:last-child")!;
    expect(arrow.querySelector("svg")).not.toBeNull();
    expect(trigger()).not.toHaveTextContent("▾");
    expect(arrow.classList).not.toContain("rotate-180");
    await userEvent.click(trigger());
    expect(trigger().querySelector("[aria-hidden]:last-child")).toBe(arrow);
    expect(arrow.classList).toContain("rotate-180");
    const list = screen.getByRole("listbox");
    expect(list.classList).toContain("origin-top");
    expect(list.classList).toContain("motion-safe:starting:scale-y-[0.97]");
  });
});

describe("Dropdown · field wiring", () => {
  it("takes its id, so a label can name it", () => {
    render(
      <>
        <label htmlFor="pick">Pick one</label>
        <Dropdown id="pick" options={OPTIONS} value="any" onChange={() => {}} />
      </>,
    );
    expect(screen.getByRole("button", { name: "Pick one" })).toHaveAttribute("id", "pick");
  });

  it("flags itself invalid and points at its description", () => {
    render(
      <>
        <Dropdown options={OPTIONS} value="any" onChange={() => {}} ariaLabel="Entity" invalid describedBy="why" />
        <p id="why">Choose one.</p>
      </>,
    );
    expect(trigger()).toBeInvalid();
    expect(trigger()).toHaveAccessibleDescription("Choose one.");
  });

  it("is valid and undescribed by default", () => {
    render(<Dropdown options={OPTIONS} value="any" onChange={() => {}} ariaLabel="Entity" />);
    expect(trigger()).not.toHaveAttribute("aria-invalid");
    expect(trigger()).not.toHaveAttribute("aria-describedby");
  });
});

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
