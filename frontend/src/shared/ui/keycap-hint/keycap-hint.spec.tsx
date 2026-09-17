import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeycapHint } from "./keycap-hint";

describe("KeycapHint", () => {
  it("names the key in a kbd and the action beside it", () => {
    render(<KeycapHint keyLabel="Esc">exit / deselect</KeycapHint>);
    expect(screen.getByText("Esc").tagName).toBe("KBD");
    expect(screen.getByText("exit / deselect")).toBeInTheDocument();
  });
});
