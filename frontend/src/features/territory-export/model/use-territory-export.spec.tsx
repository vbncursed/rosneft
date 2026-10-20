import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportTerritoryGlb } from "@/entities/territory";
import { HttpError } from "@/shared/api";
import { saveBlob } from "@/shared/lib/download";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useTerritoryExport } from "./use-territory-export";

vi.mock("@/entities/territory", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  exportTerritoryGlb: vi.fn(),
}));
vi.mock("@/shared/lib/download", () => ({ saveBlob: vi.fn() }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const exporter = () => renderHook(() => ({ s: useTerritoryExport("ust-kut"), notices: useNotices() }), { wrapper });

beforeEach(() => {
  client = new QueryClient();
  vi.mocked(exportTerritoryGlb).mockReset();
  vi.mocked(saveBlob).mockReset();
  clearNotices();
});

describe("useTerritoryExport", () => {
  it("saves the file as <slug>.glb", async () => {
    const blob = new Blob(["glb"]);
    vi.mocked(exportTerritoryGlb).mockResolvedValue(blob);
    const { result } = exporter();
    act(() => result.current.s.run());
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, "ust-kut.glb"));
    expect(exportTerritoryGlb).toHaveBeenCalledWith("ust-kut");
  });

  it("shows the gateway's own refusal", async () => {
    vi.mocked(exportTerritoryGlb).mockRejectedValue(new HttpError(409, null, "territory is not converted yet"));
    const { result } = exporter();
    act(() => result.current.s.run());
    await waitFor(() =>
      expect(result.current.notices.map((n) => n.message)).toContain("territory is not converted yet"),
    );
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("falls back to a generic notice when the network fails", async () => {
    vi.mocked(exportTerritoryGlb).mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = exporter();
    act(() => result.current.s.run());
    await waitFor(() => expect(result.current.notices.map((n) => n.message)).toContain("Export failed"));
  });

  it("is busy while the request is pending and idle after", async () => {
    let resolve!: (b: Blob) => void;
    vi.mocked(exportTerritoryGlb).mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = exporter();
    expect(result.current.s.busy).toBe(false);
    act(() => result.current.s.run());
    await waitFor(() => expect(result.current.s.busy).toBe(true));
    await act(async () => resolve(new Blob(["x"])));
    await waitFor(() => expect(result.current.s.busy).toBe(false));
  });
});
