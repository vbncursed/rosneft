import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOnline } from "@/shared/lib/use-online";
import { useTerritoryExport } from "../model/use-territory-export";
import { ExportButton } from "./export-button";

vi.mock("../model/use-territory-export");
vi.mock("@/shared/lib/use-online");

const run = vi.fn();
beforeEach(() => {
  run.mockReset();
  vi.mocked(useOnline).mockReturnValue(true);
  vi.mocked(useTerritoryExport).mockReturnValue({ busy: false, run });
});

describe("ExportButton", () => {
  it("starts the export on click", async () => {
    render(<ExportButton slug="ust-kut" />);
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(run).toHaveBeenCalledOnce();
    expect(useTerritoryExport).toHaveBeenCalledWith("ust-kut");
  });

  it("is disabled offline", () => {
    vi.mocked(useOnline).mockReturnValue(false);
    render(<ExportButton slug="ust-kut" />);
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
  });

  it("shows the button's spinner and refuses a second press while busy", async () => {
    vi.mocked(useTerritoryExport).mockReturnValue({ busy: true, run });
    render(<ExportButton slug="ust-kut" />);
    const button = screen.getByRole("button", { name: "Download" });
    expect(screen.getByTestId("button-spinner")).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(run).not.toHaveBeenCalled();
  });
});
