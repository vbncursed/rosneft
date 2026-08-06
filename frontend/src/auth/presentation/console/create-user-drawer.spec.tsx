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

// Field renders <label> as a sibling, not wrapping the input and with no
// htmlFor, so getByLabelText cannot reach either one. Email is the first
// textbox in the form, Username the second.
function fields() {
  render(<CreateUserDrawer roles={[]} onClose={() => {}} onCreated={() => {}} />);
  const boxes = screen.getAllByRole("textbox") as HTMLInputElement[];
  return { email: boxes[0], username: boxes[1] };
}

describe("CreateUserDrawer email field", () => {
  it("lower-cases an upper-case address as it is typed", () => {
    const { email } = fields();

    fireEvent.change(email, { target: { value: "Ernest.Sayapov@Gmail.COM" } });

    expect(email.value).toBe("ernest.sayapov@gmail.com");
  });

  it("leaves an already lower-case address alone", () => {
    const { email } = fields();

    fireEvent.change(email, { target: { value: "ernest@gmail.com" } });

    expect(email.value).toBe("ernest@gmail.com");
  });

  it("drops whitespace from a padded paste", () => {
    const { email } = fields();

    fireEvent.change(email, { target: { value: "  Ernest@Gmail.com  " } });

    expect(email.value).toBe("ernest@gmail.com");
  });
});

describe("CreateUserDrawer username field", () => {
  // A padded username used to reach the database intact and, once login started
  // folding the identifier, could never be matched again.
  it("drops whitespace but keeps the case", () => {
    const { username } = fields();

    fireEvent.change(username, { target: { value: "  ErnuS  " } });

    expect(username.value).toBe("ErnuS");
  });

  it("refuses an interior space — a username is one word", () => {
    const { username } = fields();

    fireEvent.change(username, { target: { value: "Ivan Petrov" } });

    expect(username.value).toBe("IvanPetrov");
  });
});
