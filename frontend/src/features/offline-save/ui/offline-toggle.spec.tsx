import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ value: {} as { saved?: unknown; progress?: unknown }, desktop: true as boolean, online: true as boolean }));
const actions = vi.hoisted(() => ({ save: vi.fn(), cancel: vi.fn(), remove: vi.fn(async () => {}) }));
vi.mock("../model/offline-store", () => ({ useOfflineTerritory: () => state.value, offlineActions: actions }));
vi.mock("@/shared/lib/use-online", () => ({ useOnline: () => state.online }));
vi.mock("@/shared/lib/desktop", () => ({ desktopBridge: () => (state.desktop ? {} : undefined) }));
const { OfflineToggle } = await import("./offline-toggle");

const saved = { slug: "a", title: "A", bytes: 2048, savedAt: "t", syncedAt: "t" };

describe("OfflineToggle", () => {
  it("draws nothing in a browser", () => {
    state.desktop = false;
    const { container } = render(<OfflineToggle slug="a" title="Ust-Kut" />);
    expect(container).toBeEmptyDOMElement();
    state.desktop = true;
  });
  it("saves on click", async () => {
    state.value = {};
    render(<OfflineToggle slug="a" title="Ust-Kut" />);
    await userEvent.click(screen.getByRole("button", { name: "Save offline" }));
    expect(actions.save).toHaveBeenCalledWith("a");
  });
  it("offers Cancel while saving and says how far it got", async () => {
    state.value = { progress: { slug: "a", state: "saving", done: 1, total: 4 } };
    render(<OfflineToggle slug="a" title="Ust-Kut" />);
    expect(screen.getByRole("status")).toHaveTextContent("Saving… 25%");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(actions.cancel).toHaveBeenCalledWith("a");
  });
  it("offers removal once saved", async () => {
    state.value = { saved };
    render(<OfflineToggle slug="a" title="Ust-Kut" />);
    expect(screen.getByRole("status")).toHaveTextContent("Available offline · 2 KB");
    await userEvent.click(screen.getByRole("button", { name: "Remove from device" }));
    expect(actions.remove).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Remove Ust-Kut from this device?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(actions.remove).toHaveBeenCalledWith("a");
  });
  it("keeps the copy when removal is cancelled", async () => {
    state.value = { saved };
    render(<OfflineToggle slug="a" title="Ust-Kut" />);
    await userEvent.click(screen.getByRole("button", { name: "Remove from device" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(actions.remove).not.toHaveBeenCalled();
  });
  it("names the territory and the state on the compact card control", () => {
    state.value = {};
    render(<OfflineToggle slug="a" title="Ust-Kut" compact />);
    expect(screen.getByRole("button", { name: "Save Ust-Kut offline" })).toBeInTheDocument();
  });
  it("never removes from the compact card control", () => {
    state.value = { saved };
    render(<OfflineToggle slug="a" title="Ust-Kut" compact />);
    expect(screen.getByRole("button", { name: "Ust-Kut — Available offline · 2 KB" })).toBeDisabled();
  });
  it("names a retry as a retry on the compact control", async () => {
    state.value = { progress: { slug: "a", state: "failed", done: 0, total: 0, error: "network" } };
    render(<OfflineToggle slug="a" title="Ust-Kut" compact />);
    await userEvent.click(screen.getByRole("button", { name: "Retry saving Ust-Kut — Couldn't save — the connection dropped" }));
    expect(actions.save).toHaveBeenCalledWith("a");
  });
  describe("offline", () => {
    afterEach(() => {
      state.online = true;
    });
    it("disables the compact control and says to reconnect", () => {
      state.online = false;
      state.value = {};
      render(<OfflineToggle slug="a" title="Ust-Kut" compact />);
      expect(screen.getByRole("button", { name: "Reconnect to save Ust-Kut" })).toBeDisabled();
    });
    it("disables the full control and says to reconnect", () => {
      state.online = false;
      state.value = {};
      render(<OfflineToggle slug="a" title="Ust-Kut" />);
      expect(screen.getByRole("status")).toHaveTextContent("Reconnect to save");
      expect(screen.getByRole("button", { name: "Save offline" })).toBeDisabled();
    });
    it("still removes a saved territory, which is local", async () => {
      state.online = false;
      state.value = { saved };
      render(<OfflineToggle slug="a" title="Ust-Kut" />);
      await userEvent.click(screen.getByRole("button", { name: "Remove from device" }));
      await userEvent.click(screen.getByRole("button", { name: "Remove" }));
      expect(actions.remove).toHaveBeenCalledWith("a");
    });
  });
});
