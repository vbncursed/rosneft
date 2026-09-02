import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage, type LoginPageProps } from "./login-page";

const credentials = () => ({
  identifier: "",
  onIdentifierChange: vi.fn(),
  password: "",
  onPasswordChange: vi.fn(),
  remember: false,
  onRememberChange: vi.fn(),
  onSubmit: vi.fn(),
});

const twoFactor = () => ({
  account: { username: "a.ivanova", email: "a.ivanova@example.com" },
  onChangeAccount: vi.fn(),
  code: "",
  onCodeChange: vi.fn(),
  onSubmit: vi.fn(),
  onUseRecoveryCode: vi.fn(),
  onBack: vi.fn(),
});

const props = (over: Partial<LoginPageProps> = {}): LoginPageProps => ({
  step: "credentials",
  intro: {
    brand: "Andrey · 3D Platform",
    headline: "Territories and models, rendered with precision",
    blurb: "Heavy conversion runs server-side.",
    points: [{ title: "Walk the site in 3D", hint: "No plugins." }],
  },
  credentials: credentials(),
  onDismissError: vi.fn(),
  ...over,
});

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false } as MediaQueryList));
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("LoginPage", () => {
  it("names the step with one h1 and shows the pitch beside it", () => {
    render(<LoginPage {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "About this platform" })).toBeInTheDocument();
  });

  it("shows where the reader is in the flow", () => {
    render(<LoginPage {...props()} />);
    // The intro panel has a list of its own, so name the one meant here.
    const steps = within(screen.getByRole("list", { name: "Sign-in progress" }));
    expect(steps.getAllByRole("listitem")[0]).toHaveAttribute("aria-current", "step");
  });

  it("shows the credentials form first", () => {
    render(<LoginPage {...props()} />);
    expect(screen.getByRole("form", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Two-factor" })).not.toBeInTheDocument();
  });

  it("moves to the second factor, rewording the heading", () => {
    render(<LoginPage {...props({ step: "two-factor", twoFactor: twoFactor() })} />);
    expect(screen.getByRole("heading", { level: 1, name: "Enter your code" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Two-factor" })).toBeInTheDocument();
    const steps = within(screen.getByRole("list", { name: "Sign-in progress" }));
    expect(steps.getAllByRole("listitem")[1]).toHaveAttribute("aria-current", "step");
  });

  it("stays on the credentials step when there is no account to verify against", () => {
    // A caller that sets the step without the account would otherwise render a
    // second factor for nobody.
    render(<LoginPage {...props({ step: "two-factor" })} />);
    expect(screen.getByRole("heading", { level: 1, name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Sign in" })).toBeInTheDocument();
  });

  it("interrupts with a failure, and lets it be dismissed", async () => {
    const onDismissError = vi.fn();
    render(<LoginPage {...props({ error: "Invalid username or password.", onDismissError })} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Invalid username or password.");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismissError).toHaveBeenCalledOnce();
  });

  it("stays quiet when nothing failed", () => {
    render(<LoginPage {...props()} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains how accounts come to exist, when told to", () => {
    render(<LoginPage {...props({ footnote: "Accounts are created by your administrator." })} />);
    expect(screen.getByText("Accounts are created by your administrator.")).toBeInTheDocument();
  });

  it("goes back to the credentials step from the second factor", async () => {
    const tf = twoFactor();
    render(<LoginPage {...props({ step: "two-factor", twoFactor: tf })} />);
    await userEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(tf.onBack).toHaveBeenCalledOnce();
  });
});
