import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api";
import type { Flow } from "./steps";
import { useTwoFactor } from "./use-two-factor";

const { setup2FA, enable2FA, regenerateRecoveryCodes, navigate } = vi.hoisted(() => ({
  setup2FA: vi.fn(),
  enable2FA: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/entities/user", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setup2FA,
  enable2FA,
  regenerateRecoveryCodes,
  meQuery: { queryKey: ["me"], queryFn: async () => ({ username: "t.throwaway" }) },
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

const SECRET = { secret: "JBSWY3DPEHPK3PXP", otpauthUrl: "otpauth://totp/Andrey:t.throwaway?secret=JBSWY3DPEHPK3PXP" };
const CODES = ["8k2fq-p1x7d", "m4wla-9zt3c"];

let client: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setup2FA.mockReset().mockResolvedValue(SECRET);
  enable2FA.mockReset().mockResolvedValue(CODES);
  regenerateRecoveryCodes.mockReset().mockResolvedValue(CODES);
  navigate.mockReset();
});

describe("useTwoFactor", () => {
  it("provisions exactly one secret per entry, however many times it renders", async () => {
    const { result, rerender } = renderHook(() => useTwoFactor("enable"), { wrapper });
    await waitFor(() => expect(result.current.secret).toBe(SECRET.secret));

    rerender();
    rerender();
    act(() => result.current.onCode("12"));

    expect(setup2FA).toHaveBeenCalledTimes(1);
    expect(result.current.otpauthUrl).toBe(SECRET.otpauthUrl);
  });

  // What the ref guard is for. Setup writes — it persists the pending secret —
  // so a second run orphans the first one. React 19's strict-mode
  // double-invoke is the case in production; jsdom under vitest does not
  // double-invoke, so the effect is re-entered the other way it can be, by
  // changing its dependency and changing it back.
  it("provisions once even when the effect runs again on the same screen", async () => {
    const { result, rerender } = renderHook(({ flow }: { flow: Flow }) => useTwoFactor(flow), {
      wrapper,
      initialProps: { flow: "enable" as Flow },
    });
    await waitFor(() => expect(result.current.secret).toBe(SECRET.secret));

    rerender({ flow: "regenerate" });
    rerender({ flow: "enable" });

    await waitFor(() => expect(setup2FA).toHaveBeenCalledTimes(1));
  });

  it("provisions nothing in the regenerate flow — the app is already paired", async () => {
    const { result } = renderHook(() => useTwoFactor("regenerate"), { wrapper });
    await waitFor(() => expect(result.current.stage).toBe("confirm"));
    expect(setup2FA).not.toHaveBeenCalled();
    expect(result.current.secret).toBe("");
  });

  it("names the 409 rather than reporting a generic failure", async () => {
    setup2FA.mockRejectedValue(new HttpError(409, null, "two-factor already enabled"));
    const { result } = renderHook(() => useTwoFactor("enable"), { wrapper });
    await waitFor(() =>
      expect(result.current.error).toBe("Two-factor is already on for this account."),
    );
  });

  // What the live gateway actually answers: twofa-service returns
  // FailedPrecondition for "2fa already enabled", and apperr.HTTPStatus maps
  // that to 422. Reading only 409 put the raw sentinel on screen and left the
  // panes up.
  it("names the 422 the same way — that is the status this gateway sends", async () => {
    setup2FA.mockRejectedValue(new HttpError(422, null, "2fa already enabled"));
    const { result } = renderHook(() => useTwoFactor("enable"), { wrapper });
    await waitFor(() =>
      expect(result.current.error).toBe("Two-factor is already on for this account."),
    );
  });

  it("passes any other setup failure through with the gateway's own words", async () => {
    setup2FA.mockRejectedValue(new HttpError(500, null, "provisioning is down"));
    const { result } = renderHook(() => useTwoFactor("enable"), { wrapper });
    await waitFor(() => expect(result.current.error).toBe("provisioning is down"));
  });

  it("confirms the code, stores the issued codes and moves to the codes stage", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useTwoFactor("enable"), { wrapper });
    await waitFor(() => expect(result.current.secret).toBe(SECRET.secret));

    act(() => result.current.onCode("123456"));
    act(() => result.current.onConfirm());

    await waitFor(() => expect(result.current.stage).toBe("codes"));
    expect(enable2FA).toHaveBeenCalledWith("123456");
    expect(result.current.codes).toEqual(CODES);
    expect(result.current.error).toBeNull();
    // The posture the account screen reads is now stale in both caches.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["two-factor"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["me"] });
  });

  it("regenerates through the recovery endpoint, not the enable one", async () => {
    const { result } = renderHook(() => useTwoFactor("regenerate"), { wrapper });
    act(() => result.current.onCode("654321"));
    act(() => result.current.onConfirm());

    await waitFor(() => expect(result.current.stage).toBe("codes"));
    expect(regenerateRecoveryCodes).toHaveBeenCalledWith("654321");
    expect(enable2FA).not.toHaveBeenCalled();
  });

  // A rejected code has issued nothing. Advancing anyway would show an empty
  // codes screen and lose the only chance to save real ones.
  it("stays on confirm when the code is refused, clearing the field", async () => {
    enable2FA.mockRejectedValue(new HttpError(400, null, "invalid code"));
    const { result } = renderHook(() => useTwoFactor("enable"), { wrapper });
    await waitFor(() => expect(result.current.secret).toBe(SECRET.secret));

    act(() => result.current.onCode("000000"));
    act(() => result.current.onConfirm());

    await waitFor(() =>
      expect(result.current.error).toBe(
        "Invalid code — check your device clock and try the next one.",
      ),
    );
    expect(result.current.stage).toBe("confirm");
    expect(result.current.codes).toEqual([]);
    expect(result.current.code).toBe("");
  });

  it("reports the confirm as busy while it is in flight", async () => {
    let release: (codes: string[]) => void = () => {};
    enable2FA.mockReturnValue(new Promise<string[]>((resolve) => (release = resolve)));
    const { result } = renderHook(() => useTwoFactor("enable"), { wrapper });
    await waitFor(() => expect(result.current.secret).toBe(SECRET.secret));

    act(() => result.current.onCode("123456"));
    act(() => result.current.onConfirm());
    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => release(CODES));
    await waitFor(() => expect(result.current.busy).toBe(false));
  });

  it("carries the signed-in username for the codes screen to name", async () => {
    const { result } = renderHook(() => useTwoFactor("enable"), { wrapper });
    await waitFor(() => expect(result.current.username).toBe("t.throwaway"));
  });

  it("leaves for the account screen from both exits", async () => {
    const { result } = renderHook(() => useTwoFactor("enable"), { wrapper });
    act(() => result.current.onDone());
    expect(navigate).toHaveBeenCalledWith({ to: "/account" });

    navigate.mockClear();
    act(() => result.current.onCancel());
    expect(navigate).toHaveBeenCalledWith({ to: "/account" });
  });
});
