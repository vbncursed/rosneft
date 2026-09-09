import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TerritoryConversionState } from "../model/use-territory-conversion";
import { TerritoryConversionScreen } from "./territory-conversion-screen";

const { useTerritoryConversion, useParams, useSearch } = vi.hoisted(() => ({
  useTerritoryConversion: vi.fn(),
  useParams: vi.fn(),
  useSearch: vi.fn(),
}));
vi.mock("../model/use-territory-conversion", () => ({ useTerritoryConversion }));
vi.mock("@tanstack/react-router", () => ({ useParams: () => useParams(), useSearch: () => useSearch() }));

const TERRITORY = { slug: "t", title: "Tenant A", sourceBlobHash: "a".repeat(64), placementCount: 0 };
const READY: TerritoryConversionState = { status: "ready", territory: TERRITORY, phase: "queued", job: null, hasLod0: false, onOpenViewer: vi.fn() };

describe("TerritoryConversionScreen", () => {
  it("hands the slug and the jobId from the URL to the hook", () => {
    useParams.mockReturnValue({ slug: "t" });
    useSearch.mockReturnValue({ jobId: "j1" });
    useTerritoryConversion.mockReturnValue(READY);
    render(<TerritoryConversionScreen />);
    expect(useTerritoryConversion).toHaveBeenCalledWith("t", "j1");

    useSearch.mockReturnValue({});
    render(<TerritoryConversionScreen />);
    expect(useTerritoryConversion).toHaveBeenLastCalledWith("t", null);
  });

  it("shows a loading status, a not-found state with a way back, and an unavailable alert", () => {
    useParams.mockReturnValue({ slug: "t" });
    useSearch.mockReturnValue({});
    useTerritoryConversion.mockReturnValue({ status: "loading" });
    const { rerender } = render(<TerritoryConversionScreen />);
    expect(screen.getByRole("status", { name: "Loading territory" })).toBeInTheDocument();

    useTerritoryConversion.mockReturnValue({ status: "missing" });
    rerender(<TerritoryConversionScreen />);
    expect(screen.getByText("Territory not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Territory catalog" })).toHaveAttribute("href", "/territories");

    useTerritoryConversion.mockReturnValue({ status: "unavailable", error: "gateway down" });
    rerender(<TerritoryConversionScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent("Territory unavailable: gateway down");
  });

  it("remounts the body on a slug change, so no ref survives into the next territory", () => {
    // The router keeps this component across a $slug change; without the key the
    // hook's previousPhase/previousJobs refs and the stream's frame carry over.
    useSearch.mockReturnValue({});
    useTerritoryConversion.mockReturnValue(READY);
    useParams.mockReturnValue({ slug: "a" });
    const { rerender, container } = render(<TerritoryConversionScreen />);
    const before = container.firstElementChild;

    useParams.mockReturnValue({ slug: "b" });
    rerender(<TerritoryConversionScreen />);
    expect(useTerritoryConversion).toHaveBeenLastCalledWith("b", null);
    expect(container.firstElementChild).not.toBe(before);
  });

  it("renders the page once ready", () => {
    useParams.mockReturnValue({ slug: "t" });
    useSearch.mockReturnValue({});
    useTerritoryConversion.mockReturnValue(READY);
    render(<TerritoryConversionScreen />);
    expect(screen.getByRole("heading", { level: 1, name: "Tenant A" })).toBeInTheDocument();
  });
});
