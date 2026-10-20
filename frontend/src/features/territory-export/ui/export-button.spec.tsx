import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOnline } from "@/shared/lib/use-online";
import { useTerritoryExport } from "../model/use-territory-export";
import { ExportButton } from "./export-button";

vi.mock("../model/use-territory-export");
vi.mock("@/shared/lib/use-online");

const run = vi.fn();
const COMPRESSED = "Compressed GLB — web viewers";
const COMPATIBLE = "Compatible GLB — Blender, desktop apps";
const OBJ = "OBJ + textures (ZIP) — SketchUp, CAD, Blender";
beforeEach(() => {
  run.mockReset();
  vi.mocked(useOnline).mockReturnValue(true);
  vi.mocked(useTerritoryExport).mockReturnValue({ busy: false, run });
});

describe("ExportButton", () => {
  it("offers the three variants in order", async () => {
    render(<ExportButton slug="ust-kut" />);
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([COMPRESSED, COMPATIBLE, OBJ]);
    expect(useTerritoryExport).toHaveBeenCalledWith("ust-kut");
  });

  it.each([
    [COMPRESSED, "compressed"],
    [COMPATIBLE, "compatible"],
    [OBJ, "obj"],
  ])("%s starts that export once", async (name, variant) => {
    render(<ExportButton slug="ust-kut" />);
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await userEvent.click(screen.getByRole("menuitem", { name }));
    expect(run).toHaveBeenCalledExactlyOnceWith(variant);
  });

  it("is disabled offline", () => {
    vi.mocked(useOnline).mockReturnValue(false);
    render(<ExportButton slug="ust-kut" />);
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
  });

  it("shows the button's spinner and opens nothing while busy", async () => {
    vi.mocked(useTerritoryExport).mockReturnValue({ busy: true, run });
    render(<ExportButton slug="ust-kut" />);
    const button = screen.getByRole("button", { name: "Download" });
    expect(screen.getByTestId("button-spinner")).toBeInTheDocument();
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
  });

  it("announces the busy state, which a disabled trigger cannot", () => {
    vi.mocked(useTerritoryExport).mockReturnValue({ busy: true, run });
    render(<ExportButton slug="ust-kut" />);
    expect(screen.getByRole("status")).toHaveTextContent("Preparing download");
  });

  it("announces nothing while idle", () => {
    render(<ExportButton slug="ust-kut" />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
