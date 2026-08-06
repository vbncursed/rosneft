// Run with: yarn test:spa  (vitest + jsdom).
//
// cleanup is wired by hand: vitest runs without `globals`, so testing-library
// cannot register its own afterEach hook.
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/auth/infrastructure/auth-admin-gateway", () => ({
  createUser: async () => {},
}));

vi.mock("@/auth/presentation/current-user-context", () => ({
  useCurrentUser: () => ({
    id: "me",
    email: "root@example.com",
    username: "root",
    status: "active",
    roleSlugs: [],
    roleTitles: {},
    permissions: [],
    isOwner: true,
    onboardingToursSeen: [],
  }),
}));

import CreateUserDrawer from "./create-user-drawer";

// The drawer renders inside MotionModal, whose reduced-motion hook reads
// window.matchMedia. jsdom does not implement it.
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

function emailInput() {
  render(<CreateUserDrawer roles={[]} onClose={() => {}} onCreated={() => {}} />);
  // Field renders <label> as a sibling, not wrapping the input and with no
  // htmlFor, so getByLabelText cannot reach it — the Email field is the first
  // textbox in the form.
  return screen.getAllByRole("textbox")[0] as HTMLInputElement;
}

describe("CreateUserDrawer email field", () => {
  it("lower-cases an upper-case address as it is typed", () => {
    const input = emailInput();

    fireEvent.change(input, { target: { value: "Ernest.Sayapov@Gmail.COM" } });

    expect(input.value).toBe("ernest.sayapov@gmail.com");
  });

  it("leaves an already lower-case address alone", () => {
    const input = emailInput();

    fireEvent.change(input, { target: { value: "ernest@gmail.com" } });

    expect(input.value).toBe("ernest@gmail.com");
  });
});
