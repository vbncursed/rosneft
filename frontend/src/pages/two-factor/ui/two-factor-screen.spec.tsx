import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TwoFactorState } from "../model/use-two-factor";
import { TwoFactorScreen } from "./two-factor-screen";

const { useTwoFactor } = vi.hoisted(() => ({ useTwoFactor: vi.fn() }));
vi.mock("../model/use-two-factor", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTwoFactor,
}));

let search: Record<string, unknown> = { mode: "setup" };
vi.mock("@tanstack/react-router", () => ({ useSearch: () => search, useNavigate: () => vi.fn() }));

const { setup2FA, enable2FA, regenerateRecoveryCodes } = vi.hoisted(() => ({
  setup2FA: vi.fn(),
  enable2FA: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
}));
vi.mock("@/entities/user", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setup2FA,
  enable2FA,
  regenerateRecoveryCodes,
  meQuery: { queryKey: ["me"], queryFn: async () => ({ username: "t.throwaway" }) },
}));

const state = (flow: TwoFactorState["flow"]): TwoFactorState => ({
  flow,
  stage: "confirm",
  secret: "JBSWY3DPEHPK3PXP",
  otpauthUrl: "otpauth://totp/x",
  code: "",
  codes: [],
  error: null,
  setupError: null,
  busy: false,
  username: "t.throwaway",
  onCode: () => {},
  onConfirm: () => {},
  onRetry: () => {},
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

// The one test that runs the real hook: the flow lives in the URL and the
// stage does not, so a flow change has to start the wizard over. Without a
// remount the enable flow's codes stay on screen under the regenerate
// headings — a set of codes attributed to a run that never happened.
describe("TwoFactorScreen, on the real hook", () => {
  it("starts over when the flow in the URL changes", async () => {
    const actual = await vi.importActual<typeof import("../model/use-two-factor")>(
      "../model/use-two-factor",
    );
    useTwoFactor.mockImplementation(actual.useTwoFactor);
    setup2FA.mockResolvedValue({ secret: "JBSWY3DPEHPK3PXP", otpauthUrl: "otpauth://totp/x" });
    enable2FA.mockResolvedValue(["8k2fq-p1x7d", "m4wla-9zt3c"]);
    regenerateRecoveryCodes.mockResolvedValue(["zzz11-aaa22"]);
    search = { mode: "setup" };

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <TwoFactorScreen />
      </QueryClientProvider>,
    );

    await screen.findByRole("img", { name: "Two-factor pairing QR code" });
    for (let i = 1; i <= 6; i++) {
      await userEvent.type(screen.getByLabelText(`Digit ${i} of 6`), String(i));
    }
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("8k2fq-p1x7d")).toBeInTheDocument();

    search = { mode: "regenerate" };
    rerender(
      <QueryClientProvider client={client}>
        <TwoFactorScreen />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Replace your recovery codes",
      ),
    );
    expect(screen.queryByText("8k2fq-p1x7d")).not.toBeInTheDocument();
    expect(screen.getByText("Step 1 · confirm")).toBeInTheDocument();
  });
});
