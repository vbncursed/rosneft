import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FreeKeys } from "../model/viewer-props";
import { FreeCamKeys } from "./free-cam-keys";

describe("FreeCamKeys", () => {
  const rows = (mode: FreeKeys) => {
    render(<FreeCamKeys mode={mode} />);
    const note = screen.getByRole("note", { name: "Free cam keys" });
    return [...note.children].map((c) => c.textContent);
  };

  it("lists the flying keys, G among them, each key in a kbd", () => {
    expect(rows("fly")).toEqual(["WASDmove", "Q/Edown / up", "Shiftfaster", "Wheelspeed", "Gwalk", "Escexit"]);
    const note = screen.getByRole("note", { name: "Free cam keys" });
    expect(within(note).getByText("WASD").tagName).toBe("KBD");
  });

  it("drops Q/E while walking: there is no up or down", () => {
    expect(rows("walk")).toEqual(["WASDmove", "Shiftrun", "Wheelspeed", "Gfly", "Escexit"]);
  });

  it("says why G does not walk over a territory with no size", () => {
    expect(rows("fly-no-scale")).toContain("Gno walk · dimensions unknown");
  });
});
