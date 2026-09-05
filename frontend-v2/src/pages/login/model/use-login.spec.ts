import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api";
import { login, verifyTwoFactor } from "@/entities/user";
import { useLogin } from "./use-login";

vi.mock("@/entities/user", () => ({
  login: vi.fn(),
  verifyTwoFactor: vi.fn(),
}));

const navigate = vi.fn();
let search: { next?: string } = {};

// A minimal stand-in for the router context: renderHook mounts no
// <RouterProvider>, and use-login.ts only needs these two hooks from it.
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useSearch: () => search,
}));

beforeEach(() => {
  vi.resetAllMocks();
  search = {};
});

describe("useLogin", () => {
  it("starts on the credentials step", () => {
    const { result } = renderHook(() => useLogin());
    expect(result.current.step).toBe("credentials");
    expect(result.current.twoFactor).toBeUndefined();
  });

  // The challenge token from step one is what step two spends. Dropping it
  // strands the user on a code screen that cannot possibly succeed.
  it("moves to the second factor and spends the challenge it was given", async () => {
    vi.mocked(login).mockResolvedValue({ twoFactorRequired: true, challengeToken: "chal-1" });
    vi.mocked(verifyTwoFactor).mockResolvedValue(undefined);
    const { result } = renderHook(() => useLogin());

    act(() => result.current.credentials.onSubmit());
    await waitFor(() => expect(result.current.step).toBe("two-factor"));

    act(() => result.current.twoFactor!.onCodeChange("402913"));
    act(() => result.current.twoFactor!.onSubmit());

    await waitFor(() => expect(verifyTwoFactor).toHaveBeenCalledWith("chal-1", "402913", true));
  });

  // The mock draws the box ticked: a fresh screen keeps the user signed in
  // unless they say otherwise.
  it("keeps the user signed in by default", async () => {
    vi.mocked(login).mockResolvedValue({ twoFactorRequired: false, challengeToken: "" });
    const { result } = renderHook(() => useLogin());

    expect(result.current.credentials.remember).toBe(true);
    act(() => result.current.credentials.onSubmit());

    await waitFor(() => expect(login).toHaveBeenCalledWith("", "", true));
  });

  // Unticked must travel through both steps — the cookie that matters is the
  // one step two sets.
  it("carries an unticked choice through the second factor", async () => {
    vi.mocked(login).mockResolvedValue({ twoFactorRequired: true, challengeToken: "chal-1" });
    vi.mocked(verifyTwoFactor).mockResolvedValue(undefined);
    const { result } = renderHook(() => useLogin());

    act(() => result.current.credentials.onRememberChange!(false));
    act(() => result.current.credentials.onSubmit());
    // Wait on the step, not on the call: login() is invoked synchronously, so
    // waiting on it resolves before the .then() that sets `twoFactor` has run.
    await waitFor(() => expect(result.current.step).toBe("two-factor"));
    expect(login).toHaveBeenCalledWith("", "", false);

    act(() => result.current.twoFactor!.onCodeChange("402913"));
    act(() => result.current.twoFactor!.onSubmit());
    await waitFor(() => expect(verifyTwoFactor).toHaveBeenCalledWith("chal-1", "402913", false));
  });

  it("surfaces a wrong password without leaving the step", async () => {
    vi.mocked(login).mockRejectedValue(
      new HttpError(401, null, "Invalid username or password."),
    );
    const { result } = renderHook(() => useLogin());

    act(() => result.current.credentials.onSubmit());

    await waitFor(() => expect(result.current.error).toBe("Invalid username or password."));
    expect(result.current.step).toBe("credentials");
  });

  it("goes back to credentials and forgets the half-typed code", async () => {
    vi.mocked(login).mockResolvedValue({ twoFactorRequired: true, challengeToken: "chal-1" });
    const { result } = renderHook(() => useLogin());

    act(() => result.current.credentials.onSubmit());
    await waitFor(() => expect(result.current.step).toBe("two-factor"));
    act(() => result.current.twoFactor!.onCodeChange("402"));
    act(() => result.current.twoFactor!.onBack());

    expect(result.current.step).toBe("credentials");
  });

  // Two submits would spend the same challenge twice; the second attempt
  // fails against a challenge the gateway has already consumed.
  it("does not submit again while one is in flight", async () => {
    vi.mocked(login).mockReturnValue(new Promise(() => {}) as never);
    const { result } = renderHook(() => useLogin());

    act(() => result.current.credentials.onSubmit());
    act(() => result.current.credentials.onSubmit());

    expect(login).toHaveBeenCalledTimes(1);
  });

  it("lands on /console with no pending redirect", async () => {
    vi.mocked(login).mockResolvedValue({ twoFactorRequired: false, challengeToken: "" });
    const { result } = renderHook(() => useLogin());

    act(() => result.current.credentials.onSubmit());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ href: "/console" }));
  });

  // A visitor bounced out of a deep link comes back to it, not to /console —
  // the whole point of guard.ts carrying `next` through in the first place.
  it("returns to the page a bounced visit was headed to", async () => {
    search = { next: "/console/audit?actor=a.ivanova" };
    vi.mocked(login).mockResolvedValue({ twoFactorRequired: false, challengeToken: "" });
    const { result } = renderHook(() => useLogin());

    act(() => result.current.credentials.onSubmit());

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ href: "/console/audit?actor=a.ivanova" }),
    );
  });
});
