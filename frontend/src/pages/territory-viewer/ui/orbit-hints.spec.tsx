import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrbitHints } from "./orbit-hints";

const rows = () => [...screen.getByRole("note", { name: "Keyboard hints" }).children].map((c) => c.textContent);

describe("OrbitHints", () => {
  // Exact text: a substring match once passed "Esc Esc exit / deselect".
  it("lists M, F and Esc where the free cam can be entered", () => {
    render(<OrbitHints freeCam />);
    expect(rows()).toEqual(["Mmeasure", "Ffree cam", "Escexit / deselect"]);
    expect(screen.getByText("F").tagName).toBe("KBD");
  });

  // A touch screen draws no free cam tile, a capture or a missing mesh makes it
  // inert: a key the reader cannot use is not advertised.
  it("leaves F out where the free cam tile is absent or inert", () => {
    render(<OrbitHints freeCam={false} />);
    expect(rows()).toEqual(["Mmeasure", "Escexit / deselect"]);
  });
});
