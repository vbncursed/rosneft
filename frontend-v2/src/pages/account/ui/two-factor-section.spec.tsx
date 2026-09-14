import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TwoFactorStatus } from "@/entities/user";
import { TwoFactorSection } from "./two-factor-section";

const ON: TwoFactorStatus = {
  enabled: true,
  enabledAt: "2026-08-12T09:20:00Z",
  recoveryRemaining: 7,
  recoveryTotal: 10,
};
const OFF: TwoFactorStatus = { enabled: false, enabledAt: null, recoveryRemaining: 0, recoveryTotal: 0 };

const props = (over: Partial<Parameters<typeof TwoFactorSection>[0]> = {}) => ({
  status: ON,
  loading: false,
  onDisable: vi.fn(),
  ...over,
});

describe("TwoFactorSection · on", () => {
  it("says a code is required at sign-in and to turn it off — not the password the mock drew", () => {
    render(<TwoFactorSection {...props()} />);
    const lede = screen.getByText(/required at every sign-in/);
    expect(lede).toHaveTextContent("Turning it off asks for a code from that app.");
    // The server accepts only a TOTP code on /api/auth/2fa/disable, so
    // promising a password here would send the user looking for the wrong
    // thing and the request would be refused.
    expect(lede).not.toHaveTextContent(/password/i);
  });

  it("shows both cards, the enrolment date and the recovery count", () => {
    render(<TwoFactorSection {...props()} />);
    expect(screen.getByText("enabled")).toBeInTheDocument();
    expect(screen.getByText("Authenticator")).toBeInTheDocument();
    expect(screen.getByText("12 Aug 2026")).toBeInTheDocument();
    expect(screen.getByText("TOTP · SHA1 · 6 digits")).toBeInTheDocument();
    expect(screen.getByText("7 of 10 codes left")).toBeInTheDocument();
  });

  it("drops the added line rather than printing a date the server never recorded", () => {
    render(<TwoFactorSection {...props({ status: { ...ON, enabledAt: null } })} />);
    expect(screen.queryByText("added")).not.toBeInTheDocument();
    expect(screen.getByText("TOTP · SHA1 · 6 digits")).toBeInTheDocument();
  });

  it("asks to disable rather than disabling on the spot, and links regeneration to the wizard", async () => {
    const onDisable = vi.fn();
    render(<TwoFactorSection {...props({ onDisable })} />);
    await userEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));
    expect(onDisable).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Regenerate recovery codes" })).toHaveAttribute(
      "href",
      "/account/two-factor?mode=regenerate",
    );
  });

  it("carries the ok border, which is the whole visual difference from the off shape", () => {
    const { container } = render(<TwoFactorSection {...props()} />);
    expect(container.firstElementChild!.className).toContain("border-ok");
  });
});

describe("TwoFactorSection · off", () => {
  it("offers enrolment and none of the enabled shape's controls", () => {
    render(<TwoFactorSection {...props({ status: OFF })} />);
    expect(screen.getByText("off")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enable two-factor" })).toHaveAttribute(
      "href",
      "/account/two-factor",
    );
    expect(screen.queryByText("Authenticator")).not.toBeInTheDocument();
    expect(screen.queryByText("Recovery codes")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disable 2FA" })).not.toBeInTheDocument();
  });

  it("says the password alone is what sign-in asks for today", () => {
    render(<TwoFactorSection {...props({ status: OFF })} />);
    expect(screen.getByText(/Sign-in asks for your password alone/)).toBeInTheDocument();
  });

  it("does not carry the ok border", () => {
    const { container } = render(<TwoFactorSection {...props({ status: OFF })} />);
    expect(container.firstElementChild!.className).not.toContain("border-ok");
  });

  // Same badge, same state, same screen as the posture card's off/unknown one:
  // `dim` at this size measures 3.35:1 dark / 3.09:1 light on its own ground,
  // under the 4.5:1 floor. The outlined `neutral` chrome is text-muted over
  // the panel — 6.82:1 / 5.69:1 — and is exactly what the posture card wears.
  it("reports off in a tone a person can actually read", () => {
    render(<TwoFactorSection {...props({ status: OFF })} />);
    const badge = screen.getByText("off");
    expect(badge.className).not.toContain("text-dim");
    expect(badge.className).toContain("text-muted");
    expect(badge.className).toContain("bg-transparent");
  });
});

describe("TwoFactorSection · unknown", () => {
  // null is "we could not find out". Drawing the on shape would promise a
  // factor that may not be there; drawing the off shape would invite an
  // enrolment the server may refuse. Neither action is offered.
  it("says so and offers nothing to act on", () => {
    render(<TwoFactorSection {...props({ status: null })} />);
    expect(screen.getByText("unknown")).toBeInTheDocument();
    expect(screen.getByText("Two-factor status is unavailable right now.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Authenticator")).not.toBeInTheDocument();
  });

  it("reports unknown in a tone a person can actually read", () => {
    render(<TwoFactorSection {...props({ status: null })} />);
    const badge = screen.getByText("unknown");
    expect(badge.className).not.toContain("text-dim");
    expect(badge.className).toContain("text-muted");
  });
});

describe("TwoFactorSection · loading", () => {
  // Still asking is not the same as having failed to find out — collapsing
  // the two would report an outage while the request is in flight.
  it("waits rather than claiming the status is unavailable", () => {
    render(<TwoFactorSection {...props({ status: null, loading: true })} />);
    expect(screen.getByRole("status", { name: "Loading two-factor status" })).toBeInTheDocument();
    expect(screen.queryByText("Two-factor status is unavailable right now.")).not.toBeInTheDocument();
    expect(screen.queryByText("unknown")).not.toBeInTheDocument();
  });
});
