import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api";
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

  // What the ref guard is actually for. React 19 double-invokes an effect on
  // mount under StrictMode, and main.tsx wraps the whole app in it; setup
  // writes, so a second run persists a second pending secret and orphans the
  // first. RTL's own `reactStrictMode` option drives that — hand-wrapping the
  // JSX in <StrictMode> does not, under this react/RTL/vitest combination.
  it("provisions once under StrictMode's double-invoke, which is how it ships", async () => {
    const { result } = renderHook(() => useTwoFactor("enable"), {
      wrapper,
      reactStrictMode: true,
    });
    await waitFor(() => expect(result.current.secret).toBe(SECRET.secret));

    expect(setup2FA).toHaveBeenCalledTimes(1);
  });

  it("provisions nothing in the regenerate flow — the app is already paired", async () => {
    const { result } = renderHook(() => useTwoFactor("regenerate"), { wrapper });
    await waitFor(() => expect(result.current.stage).toBe("confirm"));
    expect(setup2FA).not.toHaveBeenCalled();
    expect(result.current.secret).toBe("");
  });

  // What the live gateway answers: twofa-service returns FailedPrecondition
  // for "2fa already enabled", and apperr.HTTPStatus maps that to 422 —
  // re-measured against the running gateway on an account with 2FA on.
  it("names the 422 rather than reporting a generic failure, and offers no retry", async () => {
    setup2FA.mockRejectedValue(new HttpError(422, null, "2fa already enabled"));
    const { result } = renderHook(() => useTwoFactor("enable"), { wrapper });
    await waitFor(() =>
      expect(result.current.setupError).toEqual({
        message: "Two-factor is already on for this account.",
        retryable: false,
      }),
    );
  });

  // 409 was in the openapi spec and in no server answer; the spec was
  // corrected in 89e6517. Reading it as "already on" invented a terminal
  // state for a status nobody sends, and hid a real 409 behind a dead end
  // with no retry.
  it("treats a 409 as any other failure — nothing sends it", async () => {
    setup2FA.mockRejectedValue(new HttpError(409, null, "conflict"));
    const { result } = renderHook(() => useTwoFactor("enable"), { wrapper });
    await waitFor(() =>
      expect(result.current.setupError).toEqual({ message: "conflict", retryable: true }),
    );
  });

  // Not the confirm field's error: nothing is wrong with a code nobody typed,
  // and the pane it would sit under cannot succeed against a secret that was
  // never provisioned.
  it("passes any other setup failure through with the gateway's own words, as retryable", async () => {
    setup2FA.mockRejectedValue(new HttpError(500, null, "provisioning is down"));
    const { result } = renderHook(() => useTwoFactor("enable"), { wrapper });
    await waitFor(() =>
      expect(result.current.setupError).toEqual({ message: "provisioning is down", retryable: true }),
    );
    expect(result.current.error).toBeNull();
  });

  it("provisions again on retry, and clears the failure when it lands", async () => {
    setup2FA.mockRejectedValueOnce(new HttpError(500, null, "provisioning is down"));
    const { result } = renderHook(() => useTwoFactor("enable"), { wrapper });
    await waitFor(() => expect(result.current.setupError).not.toBeNull());

    act(() => result.current.onRetry());

    await waitFor(() => expect(result.current.secret).toBe(SECRET.secret));
    expect(result.current.setupError).toBeNull();
    expect(setup2FA).toHaveBeenCalledTimes(2);
  });

  it("does not provision a third time just because the screen re-renders after a retry", async () => {
    setup2FA.mockRejectedValueOnce(new HttpError(500, null, "provisioning is down"));
    const { result, rerender } = renderHook(() => useTwoFactor("enable"), { wrapper });
    await waitFor(() => expect(result.current.setupError).not.toBeNull());

    act(() => result.current.onRetry());
    await waitFor(() => expect(result.current.secret).toBe(SECRET.secret));
    rerender();
    rerender();

    expect(setup2FA).toHaveBeenCalledTimes(2);
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

  // enable2FA and regenerateRecoveryCodes answer 400 for a wrong code, so
  // they no longer carry `credentialed` and a 401 from them bounces inside
  // the client itself. Nothing here has to revalidate the session: the
  // refusal on screen can only be about the code.
  it("leaves the session alone on a refusal — a 400 is the code, and a 401 already bounced", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    enable2FA.mockRejectedValue(new HttpError(400, null, "invalid 2fa code"));
    const { result } = renderHook(() => useTwoFactor("enable"), { wrapper });
    await waitFor(() => expect(result.current.secret).toBe(SECRET.secret));

    act(() => result.current.onCode("000000"));
    act(() => result.current.onConfirm());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["me"] });
    expect(result.current.stage).toBe("confirm");
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
    // Entry provisions a secret; let it land or it lands after the test.
    await waitFor(() => expect(result.current.secret).toBe(SECRET.secret));
    act(() => result.current.onDone());
    expect(navigate).toHaveBeenCalledWith({ to: "/account" });

    navigate.mockClear();
    act(() => result.current.onCancel());
    expect(navigate).toHaveBeenCalledWith({ to: "/account" });
  });
});
