import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { OtpInput } from "./otp-input";

function Harness({ initial = "", onValue }: { initial?: string; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <OtpInput
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
    />
  );
}

const cell = (n: number) => screen.getByLabelText(`Digit ${n} of 6`) as HTMLInputElement;

describe("OtpInput", () => {
  it("renders one cell per digit inside a labelled group", () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "One-time code" })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(6);
  });

  it("advances the focus as digits are typed", async () => {
    render(<Harness />);
    await userEvent.click(cell(1));
    await userEvent.keyboard("402");

    expect(cell(1)).toHaveValue("4");
    expect(cell(2)).toHaveValue("0");
    expect(cell(3)).toHaveValue("2");
    expect(cell(4)).toHaveFocus();
  });

  it("ignores non-digits", async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await userEvent.click(cell(1));
    await userEvent.keyboard("a");
    expect(cell(1)).toHaveValue("");
    expect(onValue).not.toHaveBeenCalled();
  });

  it("clears the current cell on backspace, then walks backwards", async () => {
    render(<Harness initial="402" />);
    await userEvent.click(cell(3));
    await userEvent.keyboard("{Backspace}");
    expect(cell(3)).toHaveValue("");

    await userEvent.keyboard("{Backspace}");
    expect(cell(2)).toHaveValue("");
    expect(cell(2)).toHaveFocus();
  });

  it("moves between cells with the arrow keys", async () => {
    render(<Harness initial="402917" />);
    await userEvent.click(cell(3));
    await userEvent.keyboard("{ArrowLeft}");
    expect(cell(2)).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(cell(4)).toHaveFocus();
  });

  it("spreads a pasted code across the cells", async () => {
    render(<Harness />);
    await userEvent.click(cell(1));
    await userEvent.paste("402917");

    expect(cell(1)).toHaveValue("4");
    expect(cell(6)).toHaveValue("7");
    expect(cell(6)).toHaveFocus();
  });

  it("highlights every cell once the code is complete", async () => {
    render(<Harness initial="40291" />);
    expect(cell(1).className).toContain("border-line-2");

    await userEvent.click(cell(6));
    await userEvent.keyboard("7");
    expect(cell(1).className).toContain("border-accent");
  });

  it("accepts nothing while disabled", async () => {
    const onChange = vi.fn();
    render(<OtpInput value="" onChange={onChange} disabled />);
    await userEvent.type(cell(1), "4");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("OtpInput · sizes", () => {
  it("keeps fixed-width cells by default", () => {
    render(<Harness />);
    expect(cell(1).className).toContain("w-10");
  });

  it("lets the cells share the row when large", () => {
    render(<OtpInput value="" onChange={() => {}} size="lg" />);
    const first = screen.getByLabelText("Digit 1 of 6");
    expect(first.className).toContain("flex-1");
    expect(first.className).toContain("h-14");
  });
});
