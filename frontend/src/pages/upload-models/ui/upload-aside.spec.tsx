import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { QueueRow } from "../model/batch";
import { MODEL_CHECKLIST } from "../model/batch";
import { UploadAside } from "./upload-aside";

const file = (name: string, size = 1024): File => {
  const f = new File([new Uint8Array(16)], name);
  Object.defineProperty(f, "size", { value: size });
  return f;
};

const CURRENT_ROW: QueueRow = {
  id: "r1",
  file: file("valve-assembly.zip", 184 * 1024 * 1024),
  title: "Valve Assembly",
  status: "uploading",
  progress: 0.62,
  thumbnail: file("t.png", 100),
};

describe("UploadAside", () => {
  it("renders no current-row card when nothing is running", () => {
    render(<UploadAside checks={MODEL_CHECKLIST} failedNames={[]} />);
    expect(screen.queryByText("Current row")).not.toBeInTheDocument();
  });

  it("names the current row, its file, and the pipeline stages", () => {
    render(
      <UploadAside
        current={{ row: CURRENT_ROW, stats: { chunk: "14 / 23", speed: "24.6 MB/s", thumbnail: "attached" } }}
        checks={MODEL_CHECKLIST}
        failedNames={[]}
      />,
    );
    expect(screen.getByText("Current row")).toBeInTheDocument();
    expect(screen.getByText("Valve Assembly")).toBeInTheDocument();
    expect(screen.getByText(/valve-assembly\.zip/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Conversion stages" })).toBeInTheDocument();
    expect(screen.getByText("14 / 23")).toBeInTheDocument();
    expect(screen.getByText("24.6 MB/s")).toBeInTheDocument();
    expect(screen.getByText("attached")).toBeInTheDocument();
  });

  it("omits the thumbnail row when no thumbnail was picked", () => {
    render(
      <UploadAside
        current={{ row: { ...CURRENT_ROW, thumbnail: undefined }, stats: { chunk: "1 / 2", speed: "—" } }}
        checks={MODEL_CHECKLIST}
        failedNames={[]}
      />,
    );
    expect(screen.queryByText("thumbnail")).not.toBeInTheDocument();
  });

  it("lists the before-you-submit checklist", () => {
    render(<UploadAside checks={MODEL_CHECKLIST} failedNames={[]} />);
    expect(screen.getByText("One ZIP per model — no nested archives")).toBeInTheDocument();
  });

  it("names every failed file in its own callout", () => {
    render(<UploadAside checks={MODEL_CHECKLIST} failedNames={["flare-stack.zip"]} />);
    expect(
      screen.getByText(
        "flare-stack.zip failed — a failed row doesn't stop the rest of the batch. Fix the archive and re-add it.",
      ),
    ).toBeInTheDocument();
  });

  it("shows no failure callout with a clean batch", () => {
    render(<UploadAside checks={MODEL_CHECKLIST} failedNames={[]} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
