import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { stagesFor, PRESERVED } from "../model/replace-form";
import { ReplaceAside } from "./replace-aside";

describe("ReplaceAside", () => {
  it("names the pipeline and lists every stage", () => {
    render(<ReplaceAside stages={stagesFor("idle", null)} />);
    expect(screen.getByText("After the upload")).toBeInTheDocument();
    expect(screen.getByText("Re-convert in place")).toBeInTheDocument();
    for (const label of [
      "Chunked upload",
      "Finalize blob",
      "Parse OBJ + MTL",
      "Rebuild LOD 0-2",
      "Swap in viewer",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("lists what is preserved", () => {
    render(<ReplaceAside stages={stagesFor("idle", null)} />);
    expect(screen.getByText("What is preserved")).toBeInTheDocument();
    for (const item of PRESERVED) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
  });
});
