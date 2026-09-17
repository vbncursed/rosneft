import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { stagesFor } from "../model/replace-form";
import { ReplaceSourcePage, type ReplaceSourcePageProps } from "./replace-source-page";

const TERRITORY = {
  slug: "refinery-block-c",
  title: "Refinery Block C",
  sourceBlobHash: "5b81" + "0".repeat(56) + "c40e",
  placementCount: 0,
  createdAt: "2026-09-02T00:00:00Z",
};

const props = (over: Partial<ReplaceSourcePageProps> = {}): ReplaceSourcePageProps => ({
  territory: TERRITORY,
  currentSize: 1024,
  phase: "idle",
  file: null,
  onFiles: vi.fn(),
  onReplace: vi.fn(),
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
  canReplace: true,
  stages: stagesFor("idle", null),
  ...over,
});

describe("ReplaceSourcePage", () => {
  it("names the page with one h1, the eyebrow, the back link and the lede", () => {
    render(<ReplaceSourcePage {...props()} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Swap the 3D source of Refinery Block C" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Replace source", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Territory catalog" })).toHaveAttribute(
      "href",
      "/territories",
    );
    expect(
      screen.getByText(
        "Upload a new ZIP (OBJ + MTL + textures). The mesh re-converts in place and the territory keeps its identity — every placed object stays anchored. Use this for an updated scan of the same site.",
      ),
    ).toBeInTheDocument();
  });

  it("draws no chrome of its own — the shell owns the layout", () => {
    render(<ReplaceSourcePage {...props()} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("labels the new archive panel", () => {
    render(<ReplaceSourcePage {...props()} />);
    expect(screen.getByText("New archive")).toBeInTheDocument();
    expect(screen.getByText(".zip only · OBJ + MTL + textures")).toBeInTheDocument();
  });

  it("shows the drop zone with no file chosen and hands the pick to onFiles", async () => {
    const onFiles = vi.fn();
    render(<ReplaceSourcePage {...props({ onFiles })} />);
    const file = new File(["x"], "rev4.zip");
    const input = screen.getByLabelText("Drop the new ZIP here") as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it("shows the file card once a file is chosen", () => {
    const file = new File(["x".repeat(2048)], "rev4.zip");
    render(<ReplaceSourcePage {...props({ phase: "picked", file })} />);
    // The source pair's New card also names the file, so this is legitimately two matches.
    expect(screen.getAllByText("rev4.zip").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("2 KB · ZIP")).toBeInTheDocument();
  });

  it("keeps Replace source disabled until a file is picked", () => {
    render(<ReplaceSourcePage {...props()} />);
    expect(screen.getByRole("button", { name: "Replace source" })).toBeDisabled();
  });

  it("enables Replace source once a file is picked", () => {
    const file = new File(["x"], "rev4.zip");
    render(<ReplaceSourcePage {...props({ phase: "picked", file })} />);
    expect(screen.getByRole("button", { name: "Replace source" })).toBeEnabled();
  });

  it("shows the busy label and Cancel upload while the replace is running", () => {
    const file = new File(["x"], "rev4.zip");
    render(<ReplaceSourcePage {...props({ phase: "uploading", file })} />);
    expect(screen.getByRole("button", { name: "Uploading…" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel upload" })).toBeInTheDocument();
  });

  it("hides Cancel once the bytes are done and the final POST is running", () => {
    const file = new File(["x"], "rev4.zip");
    render(<ReplaceSourcePage {...props({ phase: "replacing", file })} />);
    expect(screen.getByRole("button", { name: "Uploading…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel upload" })).not.toBeInTheDocument();
  });

  it("warns that the territory goes back to converting", () => {
    render(<ReplaceSourcePage {...props()} />);
    expect(screen.getByText("The territory goes back to converting")).toBeInTheDocument();
    expect(
      screen.getByText(/While the new mesh is processed the viewer shows the conversion screen\./),
    ).toBeInTheDocument();
  });

  it("replaces the whole body with a callout when the viewer may not replace", () => {
    render(<ReplaceSourcePage {...props({ canReplace: false })} />);
    expect(screen.getByText("Replacing a source needs territory:write.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Drop the new ZIP here")).not.toBeInTheDocument();
    expect(screen.queryByText("The territory goes back to converting")).not.toBeInTheDocument();
  });
});
