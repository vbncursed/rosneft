import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ALREADY_ON, type TwoFactorState } from "../model/use-two-factor";
import { TwoFactorPage } from "./two-factor-page";

const CODES = Array.from({ length: 10 }, (_, i) => `code-${i}`);

const base: TwoFactorState = {
  flow: "enable",
  stage: "confirm",
  secret: "JBSWY3DPEHPK3PXP",
  otpauthUrl: "otpauth://totp/Andrey:t.throwaway?secret=JBSWY3DPEHPK3PXP",
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
};

describe("TwoFactorPage", () => {
  it("opens the enrolment with both live panes and a way back", () => {
    render(<TwoFactorPage {...base} />);
    expect(screen.getByRole("heading", { level: 1, name: "Enable two-factor" })).toBeInTheDocument();
    expect(screen.getByText("Step 1 · scan")).toBeInTheDocument();
    expect(screen.getByText("Step 2 · confirm")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Account" })).toHaveAttribute("href", "/account");
  });

  // Nothing is scanned when the app is already paired, and the heading has to
  // say what this run actually does rather than offering to enable it again.
  it("regenerating drops the scan pane and names its own job", () => {
    render(<TwoFactorPage {...base} flow="regenerate" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Replace your recovery codes" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Step 1 · scan")).not.toBeInTheDocument();
    expect(screen.getByText("Step 1 · confirm")).toBeInTheDocument();
  });

  it("shows the enable flow as three chips and the regenerate flow as two", () => {
    const { unmount } = render(<TwoFactorPage {...base} />);
    expect(screen.getAllByRole("listitem").slice(0, 3).map((li) => li.textContent)).toEqual([
      "1 · scan",
      "2 · confirm",
      "3 · save codes",
    ]);
    unmount();

    render(<TwoFactorPage {...base} flow="regenerate" />);
    expect(screen.getByRole("list", { name: "Two-factor progress" }).children).toHaveLength(2);
  });

  // steps() is tested on its own; this is the wiring. Pinning the chips to
  // "confirm" leaves the codes screen showing "3 · save codes" as pending
  // while the codes are being read off it.
  it("feeds the chips the stage that is on screen", () => {
    render(<TwoFactorPage {...base} stage="codes" codes={CODES} />);
    const chips = within(screen.getByRole("list", { name: "Two-factor progress" })).getAllByRole(
      "listitem",
    );
    expect(chips.map((c) => c.getAttribute("aria-current"))).toEqual([null, null, "step"]);
    expect(chips[2]).toHaveTextContent("3 · save codes");
    expect(chips[0]).toHaveTextContent("completed");
  });

  it("hands the ten issued codes over, under the name they belong to", () => {
    render(<TwoFactorPage {...base} stage="codes" codes={CODES} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Save your recovery codes" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Two-factor is on for t.throwaway")).toBeInTheDocument();
    for (const code of CODES) expect(screen.getByText(code)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Leaving this screen without saving them means your only way back in is an administrator reset.",
      ),
    ).toBeInTheDocument();
  });

  it("numbers the codes step after the flow that reached it", () => {
    const { unmount } = render(<TwoFactorPage {...base} stage="codes" codes={CODES} />);
    expect(screen.getByText("Step 3 · save these recovery codes")).toBeInTheDocument();
    unmount();

    render(<TwoFactorPage {...base} flow="regenerate" stage="codes" codes={CODES} />);
    expect(screen.getByText("Step 2 · save these recovery codes")).toBeInTheDocument();
  });

  it("leaves only when the person says they saved them", async () => {
    const onDone = vi.fn();
    render(<TwoFactorPage {...base} stage="codes" codes={CODES} onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: "I saved them" }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("shows no confirm pane once the codes are on screen", () => {
    render(<TwoFactorPage {...base} stage="codes" codes={CODES} />);
    expect(screen.queryByRole("button", { name: "Enter 6 digits" })).not.toBeInTheDocument();
  });

  // A wizard that cannot proceed must say so where it stands. A toast would
  // vanish and leave two panes that answer 409 to everything.
  it("replaces the panes when 2FA is already on, and offers the way out", () => {
    render(<TwoFactorPage {...base} setupError={{ message: ALREADY_ON, retryable: false }} />);
    expect(screen.getByText(ALREADY_ON)).toBeInTheDocument();
    expect(screen.queryByText("Step 1 · scan")).not.toBeInTheDocument();
    expect(screen.queryByText("Step 2 · confirm")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to your account" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  // Without this the QR is a permanent skeleton, the gateway's message sits
  // under the OTP field, and Confirm happily POSTs a code against a secret
  // that was never provisioned.
  it("replaces the panes when setup itself failed, and offers a retry", async () => {
    const onRetry = vi.fn();
    render(
      <TwoFactorPage
        {...base}
        setupError={{ message: "provisioning is down", retryable: true }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("provisioning is down")).toBeInTheDocument();
    expect(screen.queryByText("Step 1 · scan")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enter 6 digits" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  // The chips describe a sequence this screen can no longer walk: "1 · scan"
  // in the accent tone would be inviting the reader into a step that does not
  // exist for them.
  it("drops the step chips when the wizard is blocked", () => {
    render(<TwoFactorPage {...base} setupError={{ message: ALREADY_ON, retryable: false }} />);
    expect(screen.queryByRole("list", { name: "Two-factor progress" })).not.toBeInTheDocument();
  });

  // Only the 409/422 is terminal. A refused code belongs in the pane, beside the
  // field that has to be retyped.
  it("keeps the panes for a refused code", () => {
    render(
      <TwoFactorPage {...base} error="Invalid code — check your device clock and try the next one." />,
    );
    expect(screen.getByText("Step 2 · confirm")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid code");
  });
});
