import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Vec3Field } from "./vec3-field";
import type { Vec3 } from "./vec3";

function Harness({ initial = { x: 12.4, y: 0, z: -3.1 } }: { initial?: Vec3 }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Vec3Field label="Position" value={value} onChange={setValue} />
      <output data-testid="readout">{`${value.x},${value.y},${value.z}`}</output>
    </>
  );
}

const axis = (a: string) => screen.getByLabelText(`Position ${a}`) as HTMLInputElement;

describe("Vec3Field", () => {
  it("shows one labelled box per axis", () => {
    render(<Harness />);
    expect(axis("x")).toHaveValue("12.4");
    expect(axis("y")).toHaveValue("0");
    expect(axis("z")).toHaveValue("-3.1");
  });

  it("reports a new number for the edited axis only", async () => {
    render(<Harness />);
    await userEvent.clear(axis("y"));
    await userEvent.type(axis("y"), "5.5");
    expect(screen.getByTestId("readout")).toHaveTextContent("12.4,5.5,-3.1");
  });

  it("lets a negative number be typed without snapping back", async () => {
    render(<Harness />);
    await userEvent.clear(axis("x"));
    await userEvent.type(axis("x"), "-");
    // "-" is not a number yet, so the box keeps it and the value stays put.
    expect(axis("x")).toHaveValue("-");
    await userEvent.type(axis("x"), "8.25");
    expect(axis("x")).toHaveValue("-8.25");
    expect(screen.getByTestId("readout")).toHaveTextContent("-8.25,0,-3.1");
  });

  it("keeps a trailing decimal point while it is being typed", async () => {
    render(<Harness />);
    await userEvent.clear(axis("z"));
    await userEvent.type(axis("z"), "4.");
    expect(axis("z")).toHaveValue("4.");
  });

  it("falls back to the canonical value on blur", async () => {
    render(<Harness />);
    await userEvent.clear(axis("x"));
    await userEvent.type(axis("x"), "9.50");
    await userEvent.tab();
    expect(axis("x")).toHaveValue("9.5");
  });

  it("never reports a change for unparseable input", async () => {
    const onChange = vi.fn();
    render(<Vec3Field label="Scale" value={{ x: 1, y: 1, z: 1 }} onChange={onChange} />);
    await userEvent.clear(screen.getByLabelText("Scale x"));
    await userEvent.type(screen.getByLabelText("Scale x"), "abc");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("blocks editing while disabled", async () => {
    render(<Vec3Field label="Position" value={{ x: 1, y: 2, z: 3 }} onChange={() => {}} disabled />);
    expect(screen.getByLabelText("Position x")).toBeDisabled();
  });
});
