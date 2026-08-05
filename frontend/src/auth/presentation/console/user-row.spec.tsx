// Run with: yarn test:spa  (vitest + jsdom).
//
// cleanup is wired by hand: vitest runs without `globals`, so testing-library
// cannot register its own afterEach hook.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import UserRow from "./user-row";
import type { AdminUser } from "@/auth/domain/user";
import type { Principal } from "@/auth/domain/principal";

const user = (over: Partial<AdminUser> = {}): AdminUser => ({
  id: "u1",
  email: "a@b.c",
  username: "ivan",
  status: "active",
  totpEnabled: false,
  passkeyEnabled: false,
  roleSlugs: [],
  roleTitles: {},
  permissions: [],
  isOwner: false,
  onboardingToursSeen: [],
  ...over,
});

const me: Principal = user({ id: "me", username: "root", isOwner: true });

// A <tr> is invalid outside a table and React warns; the row under test is the
// component, so give it the minimum valid host.
function renderRow(u: AdminUser) {
  render(
    <table>
      <tbody>
        <UserRow u={u} me={me} roleTitle={(s) => s} act={async () => {}} onEditRoles={() => {}} />
      </tbody>
    </table>,
  );
  return screen.getAllByRole("cell");
}

// Columns are positional; getByText("Yes") would not say which factor it found.
const factorCells = (cells: HTMLElement[]) => ({ totp: cells[4], passkey: cells[5] });

afterEach(cleanup);

describe("UserRow factor columns", () => {
  it("shows Yes for an enabled factor and No for a disabled one", () => {
    const { totp, passkey } = factorCells(renderRow(user({ totpEnabled: true, passkeyEnabled: false })));

    expect(within(totp).getByText("Yes")).toBeTruthy();
    expect(within(passkey).getByText("No")).toBeTruthy();
  });

  it("shows Yes in the passkey column independently of 2FA", () => {
    const { totp, passkey } = factorCells(renderRow(user({ totpEnabled: false, passkeyEnabled: true })));

    expect(within(totp).getByText("No")).toBeTruthy();
    expect(within(passkey).getByText("Yes")).toBeTruthy();
  });

  // The bug this whole change exists to remove was a confident wrong "No".
  // When the owning service did not answer, the console must say so.
  it("shows a dash, not No, when a factor status is unknown", () => {
    const { totp, passkey } = factorCells(renderRow(user({ totpEnabled: null, passkeyEnabled: null })));

    expect(within(totp).getByText("—")).toBeTruthy();
    expect(within(passkey).getByText("—")).toBeTruthy();
    expect(within(totp).queryByText("No")).toBeNull();
    expect(within(passkey).queryByText("No")).toBeNull();
  });
});
