import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TwoFactorState } from "../model/use-two-factor";
import { TwoFactorScreen } from "./two-factor-screen";

const { useTwoFactor } = vi.hoisted(() => ({ useTwoFactor: vi.fn() }));
vi.mock("../model/use-two-factor", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTwoFactor,
}));

let search: Record<string, unknown> = { mode: "setup" };
vi.mock("@tanstack/react-router", () => ({ useSearch: () => search }));

const state = (flow: TwoFactorState["flow"]): TwoFactorState => ({
  flow,
  stage: "confirm",
  secret: "JBSWY3DPEHPK3PXP",
  otpauthUrl: "otpauth://totp/x",
  code: "",
  codes: [],
  error: null,
  busy: false,
  username: "t.throwaway",
  onCode: () => {},
  onConfirm: () => {},
  onDone: () => {},
  onCancel: () => {},
});

beforeEach(() => {
  useTwoFactor.mockReset().mockImplementation((flow: TwoFactorState["flow"]) => state(flow));
  search = { mode: "setup" };
});

describe("TwoFactorScreen", () => {
  it("runs the enrolment for mode=setup", () => {
    render(<TwoFactorScreen />);
    expect(useTwoFactor).toHaveBeenCalledWith("enable");
    expect(screen.getByRole("heading", { level: 1, name: "Enable two-factor" })).toBeInTheDocument();
  });

  it("runs the regeneration for mode=regenerate", () => {
    search = { mode: "regenerate" };
    render(<TwoFactorScreen />);
    expect(useTwoFactor).toHaveBeenCalledWith("regenerate");
  });

  // The route validates the search, but a hand-typed or stale mode must land
  // on the enrolment rather than on an undefined flow.
  it("treats anything else as the enrolment", () => {
    search = { mode: "nonsense" };
    render(<TwoFactorScreen />);
    expect(useTwoFactor).toHaveBeenCalledWith("enable");
  });
});
