import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FreeCamKeys } from "./free-cam-keys";

describe("FreeCamKeys", () => {
  it("lists every free cam key with its action, each key in a kbd", () => {
    render(<FreeCamKeys />);
    const note = screen.getByRole("note", { name: "Free cam keys" });
    expect([...note.children].map((c) => c.textContent)).toEqual([
      "WASDmove",
      "Q/Edown / up",
      "Shiftfaster",
      "Wheelspeed",
      "Escexit",
    ]);
    expect(within(note).getByText("WASD").tagName).toBe("KBD");
  });
});
