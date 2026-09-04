# Console fixes, round one — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three rendering bugs at their root in shared components, add password generation with copy-to-clipboard to the create-user dialog, and let an admin delete a custom role that nobody holds.

**Architecture:** One Go change in auth-service (a foreign-key violation on role delete becomes `ErrRoleInUse` → 422 instead of 500). Three frontend commits: the bugs (one class moved, one `align` prop, one line-height), the password rules (a verbatim port of the old SPA's `credential-rules.ts` into `entities/user`, wired through `PasswordField`'s existing `action` slot, plus a shared `copyText`), and role deletion (gateway call, mutation, inspector button gated on `role.kind` and `role.users`, `ConfirmDialog`).

**Tech Stack:** Go 1.25 (auth-service: pgx v5, minimock, testify/suite, gotest.tools/assert); frontend-v2: React 19, TypeScript, vitest + Testing Library, TanStack Query, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-04-console-fixes-round-one-design.md`

## Global Constraints

- Branch `feat/frontend-v2-design-system`. Stage by path only: `git add backend/services/auth-service backend/services/gateway-service/api/openapi.yaml` or `git add frontend-v2`. **Never stage `.claude/settings.json` or `backend/go.work.sum`.**
- Go commits: `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check` before committing (~80 s).
- Frontend-only commits: `git commit --no-verify`, body line "Frontend-only; the backend gate is skipped with --no-verify because nothing under backend/ changes."
- `yarn`, never `npm`; all frontend commands from `frontend-v2/`. `yarn lint` is the type check. `yarn test:coverage` thresholds 90/85/90/90 hold.
- frontend-v2 200-line cap, hand-checked (skip blanks and comments); a spec per module and a Cosmos fixture per JSX slice (`src/architecture.spec.ts`). Feature-Sliced: `entities` never import `features`/`pages`.
- Backend password rule, mirrored verbatim: 8–256 runes; at least one upper-case (`\p{Lu}`), one lower-case (`\p{Ll}`), one digit (`\p{Nd}`), one other character. Generated length 16.
- Copy text, verbatim: `Password copied`; `Could not copy — select it and copy by hand`; `Role deleted`; hint `N users hold this role — reassign them first`; confirm title `Delete role "<title>"?`, body `Its permissions are gone with it. This cannot be undone.`, confirm `Delete`.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef
  ```
- Skills each implementer loads first via the Skill tool: `ponytail:ponytail`, `clean-code`, `superpowers:test-driven-development`; frontend tasks add `react-best-practices`, `senior-frontend`, `tailwind-patterns`; Go tasks add `modern-go-guidelines:use-modern-go`, `cc-skills-golang:golang-how-to`.

**Rulings against the spec, made while planning:**
- Spec §3 says the login override loses `leading-[normal]!`. It stays: the override also pins `text-[14px]!` and `py-[11px]!` for the login mock, and swapping its line-height to the shared `leading-5` would change that field's height. The shared fix alone removes the jump everywhere; the override is a design choice, not a workaround any more — cost if wrong: one redundant class on one screen.
- Spec §6 names a `holdersOf(slug)` on `RolesState`. Not needed: `withUserCounts` already puts `users: number | null` on every `Role` the page renders, and the inspector receives that role. The inspector reads `role.users` — cost if wrong: nothing, it is the same number.
- `PasswordField.action.onClick` receives a `reveal()` callback so Generate can show the value without the field becoming controlled on `shown`. The login's "Forgot?" caller ignores the argument — TypeScript accepts a shorter parameter list.

---

## File map

**Task 1 (Go):** `backend/services/auth-service/internal/domain/errors.go` (+`ErrRoleInUse`), `internal/storage/roles/store.go` (`isFKViolation`), `internal/storage/roles/delete.go`, `internal/transport/grpcapi/server.go` (`statusByCode`), new `internal/storage/roles/delete_integration_test.go`, `backend/services/gateway-service/api/openapi.yaml:2111`.

**Task 2 (frontend bugs):** `entities/content/ui/content-row.tsx` + spec; `shared/ui/date-picker/date-picker.tsx` + spec; `pages/audit/ui/audit-screen.tsx` + spec; `shared/ui/text-field/control-class.ts` + spec; `shared/ui/password-field/password-field.spec.tsx`.

**Task 3 (password):** new `entities/user/model/password-rules.ts` + spec, `entities/user/index.ts`; new `shared/lib/copy-text.ts` + spec; `shared/ui/password-field/password-field.tsx` + spec; `features/create-user/ui/create-user-dialog.tsx` + spec; `pages/audit/model/use-audit.ts`; `features/recovery-codes/ui/recovery-codes.tsx` + spec.

**Task 4 (delete role):** `entities/role/api/roles-gateway.ts` + spec, `entities/role/index.ts`; `pages/roles/model/use-roles.ts` + spec; `widgets/role-inspector/ui/role-inspector.tsx` + spec; `pages/roles/ui/roles-page.tsx` + spec; `pages/roles/ui/roles-screen.tsx` + spec.

---

### Task 1: `ErrRoleInUse` — deleting a role with holders answers 422, not 500

**Files:**
- Modify: `backend/services/auth-service/internal/domain/errors.go`
- Modify: `backend/services/auth-service/internal/storage/roles/store.go:59-62`
- Modify: `backend/services/auth-service/internal/storage/roles/delete.go`
- Modify: `backend/services/auth-service/internal/transport/grpcapi/server.go:125-129`
- Create: `backend/services/auth-service/internal/storage/roles/delete_integration_test.go`
- Modify: `backend/services/gateway-service/api/openapi.yaml:2111`

**Interfaces:**
- Produces: `domain.ErrRoleInUse` ("role is still assigned to users"), surfaced as gRPC `FailedPrecondition` → HTTP 422 `{code: "unprocessable", message: "roles.Delete: role is still assigned to users"}` (the gateway renders `st.Message()`; the message is what Task 4's toast shows).

- [ ] **Step 1: The sentinel and the mapping**

`errors.go`, after `ErrSystemRole`:
```go
	ErrRoleInUse        = errors.New("role is still assigned to users")
```
`grpcapi/server.go` `codes.FailedPrecondition` list gains `domain.ErrRoleInUse`.

- [ ] **Step 2: Write the failing integration test**

`delete_integration_test.go` — copy the suite skeleton from `internal/storage/users/list_integration_test.go` (build tag `integration`, `postgres:18.6`, `migrate.Up`, `roles.New(pool)`), then:

```go
func (s *DeleteSuite) TestRefusesARoleSomebodyStillHolds() {
	ctx := s.T().Context()
	role, err := s.store.Create(ctx, domain.Role{Slug: "surveyor", Title: "Surveyor", OwnerAdminID: "admin-1"})
	assert.NilError(s.T(), err)
	// A holder: insert a user and the binding directly — the users store is
	// not under test here. Column names per 00001_init.sql.
	_, err = s.pool.Exec(ctx, `INSERT INTO users (id, email, username, password_hash) VALUES ('u-1', 'u1@x', 'u1', 'h')`)
	assert.NilError(s.T(), err)
	_, err = s.pool.Exec(ctx, `INSERT INTO user_roles (user_id, role_id) VALUES ('u-1', $1)`, role.ID)
	assert.NilError(s.T(), err)

	err = s.store.Delete(ctx, "surveyor", "admin-1", false)
	assert.ErrorIs(s.T(), err, domain.ErrRoleInUse)

	// Unassign, and the same delete goes through.
	_, err = s.pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id = 'u-1'`)
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.store.Delete(ctx, "surveyor", "admin-1", false))
}
```
Check the real column set of `users` in `00001_init.sql` and later migrations (NOT NULL columns such as `created_by`, `status`) and fill the INSERT accordingly; check whether `domain.Role` carries the id (`role.ID`) or whether a `SELECT id FROM roles WHERE slug = $1` is needed.

Run: `cd backend/services/auth-service && go test -tags=integration ./internal/storage/roles/ -run DeleteSuite 2>&1 | tail -8` (Docker required; if it is down, say so in the report — do not skip silently).
Expected: FAIL — the error wraps a `*pgconn.PgError` (23503), not `ErrRoleInUse`.

- [ ] **Step 3: Map the violation**

`store.go`, beside `isUnique`:
```go
func isFKViolation(err error) bool {
	pgErr, ok := errors.AsType[*pgconn.PgError](err)
	return ok && pgErr.Code == "23503"
}
```
`delete.go`: after `audittx.Run` returns `err`:
```go
	if isFKViolation(err) {
		return fmt.Errorf("roles.Delete: %w", domain.ErrRoleInUse)
	}
```
and the doc comment's "surfaced wrapped" sentence becomes "surfaces as ErrRoleInUse — the admin reassigns first; nothing cascades".

- [ ] **Step 4: OpenAPI wording**

`openapi.yaml:2111`: `'422': { description: System role, or a role still assigned to users }`. Regenerate nothing — frontend-v2's DTO carries only the description string and Task 4 does not read it.

- [ ] **Step 5: Run, gate, commit**

Run the integration test again (PASS), then `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check`.

```bash
git add backend/services/auth-service backend/services/gateway-service/api/openapi.yaml
git commit -m "fix(auth): deleting a role somebody still holds answers 422, not 500

The plain DELETE tripped the user_roles foreign key and the raw pgx error
matched no sentinel, so the admin saw a generic server error. SQLSTATE
23503 now maps to ErrRoleInUse — FailedPrecondition, 422 — with a message
the console can show. Nothing cascades: the admin reassigns first.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

### Task 2: Three rendering bugs

**Files:**
- Modify: `frontend-v2/src/entities/content/ui/content-row.tsx:34,41`; Test `content-row.spec.tsx`
- Modify: `frontend-v2/src/shared/ui/date-picker/date-picker.tsx:16-26,83`; Test `date-picker.spec.tsx`
- Modify: `frontend-v2/src/pages/audit/ui/audit-screen.tsx:75-85`; Test `audit-screen.spec.tsx`
- Modify: `frontend-v2/src/shared/ui/text-field/control-class.ts:16`; Test `control-class.spec.ts`
- Test: `frontend-v2/src/shared/ui/password-field/password-field.spec.tsx`

**Interfaces:**
- Produces: `DatePickerProps.align?: "start" | "end"` (default `"start"`).

- [ ] **Step 1: Content row — spec then fix**

`content-row.spec.tsx`, in `colours the rail by conversion state` or a new test:
```ts
  it("does not clip its own corner — the row menu must be able to hang below it", () => {
    const { container } = render(<ContentRow item={item()} />);
    const article = container.querySelector("article")!;
    expect(article.className).not.toContain("overflow-hidden");
    // The rail keeps the rounded corner on its own.
    expect(container.querySelector("span[aria-hidden]")!.className).toContain("rounded-l-[11px]");
  });
```
`content-row.tsx:34`: remove `overflow-hidden`; `:41`: `"absolute inset-y-0 left-0 w-[3px] rounded-l-[11px]"`. Add a comment: `// No overflow-hidden on the row: the kebab menu is absolutely positioned inside it and was being cut at the row's bottom edge.`

- [ ] **Step 2: DatePicker `align` — spec then fix**

`date-picker.spec.tsx`:
```ts
  it("anchors the calendar to the trigger's left edge by default, and to its right on align=end", async () => {
    const { unmount } = render(<Harness />);
    await userEvent.click(field());
    expect(screen.getByRole("dialog").className).toContain("left-0");
    unmount();
    render(<DatePicker label="To" value="" onChange={() => {}} align="end" />);
    await userEvent.click(screen.getByRole("button", { name: "To" }));
    expect(screen.getByRole("dialog").className).toContain("right-0");
  });
```
`date-picker.tsx`: add `/** Which trigger edge the calendar hangs from; "end" for a picker at the right edge of a row. */ align?: "start" | "end";` to the props, destructure `align = "start"`, and on the dialog: `className={cx("absolute z-10 mt-1 w-[17.5rem] …", align === "end" ? "right-0" : "left-0")}` (`cx` is already imported).

`audit-screen.tsx`: `align="end"` on both `<DatePicker>`s. `audit-screen.spec.tsx`: in the existing pickers test (or a new one) open the To picker and assert `screen.getByRole("dialog", { name: "To" }).className` contains `right-0`.

- [ ] **Step 3: Line-height — spec then fix**

`control-class.spec.ts`, in `switches to mono for slugs and hashes`:
```ts
    // Same line-height in both faces: a PasswordField toggles mono on reveal
    // and the input must not change height under the eye button.
    expect(cls).toContain("leading-5");
```
`control-class.ts:16`: `mono ? "font-mono text-[13px] leading-5" : "font-sans text-sm"`.

`password-field.spec.tsx`:
```ts
  it("keeps the same line-height shown and hidden, so the field does not jump", async () => {
    render(<PasswordField label="Password" defaultValue="x" />);
    const input = screen.getByLabelText("Password");
    const before = input.className;
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.className).toContain("leading-5");
    expect(before).toMatch(/text-sm/); // text-sm carries leading-5 by definition
  });
```

- [ ] **Step 4: Lint, tests, live look, commit**

`yarn lint && yarn test:coverage`. Live: open `/console/content`, open a row's kebab — the whole menu is visible; `/console/audit`, open the To calendar — inside the viewport; `/console/users` → Create user, toggle the eye — no jump. Note what was seen.

```bash
git add frontend-v2
git commit --no-verify -m "fix(frontend-v2): the row menu is no longer clipped, the To calendar stays on screen, the password field stops jumping

Frontend-only; the backend gate is skipped with --no-verify because
nothing under backend/ changes.

The Content row's overflow-hidden existed to round the status rail and
cut the kebab menu with it; the rail rounds itself now. DatePicker gains
align=end, and both Audit pickers use it. The shared control class gives
the mono face the same line-height as the sans one, so PasswordField's
reveal no longer changes the input's height anywhere.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

### Task 3: Password rules, Generate, copy to clipboard

**Files:**
- Create: `frontend-v2/src/entities/user/model/password-rules.ts`, `password-rules.spec.ts`; Modify `frontend-v2/src/entities/user/index.ts`
- Create: `frontend-v2/src/shared/lib/copy-text.ts`, `copy-text.spec.ts`
- Modify: `frontend-v2/src/shared/ui/password-field/password-field.tsx:11,39-41`; Test `password-field.spec.tsx`
- Modify: `frontend-v2/src/features/create-user/ui/create-user-dialog.tsx`; Test `create-user-dialog.spec.tsx`
- Modify: `frontend-v2/src/pages/audit/model/use-audit.ts:118-123`
- Modify: `frontend-v2/src/features/recovery-codes/ui/recovery-codes.tsx:18-21`; Test `recovery-codes.spec.tsx`

**Interfaces:**
- Produces: `validatePassword(v: string): string | null`, `generatePassword(len = 16): string` from `@/entities/user`; `copyText(text: string): Promise<boolean>` from `@/shared/lib/copy-text`; `PasswordFieldProps.action: { label: string; onClick: (reveal: () => void) => void }`.

- [ ] **Step 1: Port the rules — spec first**

`password-rules.spec.ts`:
```ts
import { describe, expect, it } from "vitest";
import { generatePassword, validatePassword } from "./password-rules";

describe("validatePassword — mirrors auth-service internal/validate", () => {
  it("accepts one of each class within 8–256", () => {
    expect(validatePassword("Abcdef1!")).toBeNull();
  });
  it("names the length bound", () => {
    expect(validatePassword("Ab1!")).toBe("Password must be 8–256 characters");
    expect(validatePassword("A1!" + "a".repeat(254))).toBe("Password must be 8–256 characters");
  });
  it("names the missing class", () => {
    const msg = "Password needs an upper- and lower-case letter, a digit, and a special character";
    expect(validatePassword("abcdef1!")).toBe(msg);
    expect(validatePassword("ABCDEF1!")).toBe(msg);
    expect(validatePassword("Abcdefg!")).toBe(msg);
    expect(validatePassword("Abcdefg1")).toBe(msg);
  });
  it("counts runes, not UTF-16 units, like the Go side", () => {
    expect(validatePassword("Ab1!😀😀😀😀")).toBeNull(); // 8 runes
  });
});

describe("generatePassword", () => {
  it("always satisfies validatePassword, at the default and a custom length", () => {
    for (let i = 0; i < 500; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(16);
      expect(validatePassword(p)).toBeNull();
    }
    expect(generatePassword(32)).toHaveLength(32);
  });
});
```
`password-rules.ts`: the `validatePassword`, constants, `randInt` and `generatePassword` from `frontend/src/auth/domain/credential-rules.ts` — verbatim (keep the `ponytail:` note on modulo bias); drop the username/email helpers. Header: `// Client-side mirror of auth-service's internal/validate (password only). The backend stays the source of truth; change both together.` Export both from `entities/user/index.ts`.

- [ ] **Step 2: `copyText` — spec first**

`copy-text.spec.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./copy-text";

afterEach(() => vi.unstubAllGlobals());

describe("copyText", () => {
  it("resolves true when the clipboard accepts", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyText("x")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("x");
  });
  it("resolves false when the clipboard refuses", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
    await expect(copyText("x")).resolves.toBe(false);
  });
  it("resolves false when there is no clipboard at all", async () => {
    vi.stubGlobal("navigator", {});
    await expect(copyText("x")).resolves.toBe(false);
  });
});
```
`copy-text.ts`:
```ts
/** True when the text reached the clipboard. Callers own the toast. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
```
(`navigator.clipboard` undefined throws inside the `try` and lands in the `catch`.)

- [ ] **Step 3: `PasswordField.action` hands out `reveal`**

`password-field.tsx:11`: `action?: { label: string; onClick: (reveal: () => void) => void };` and the button: `onClick={() => action.onClick(() => setShown(true))}`. `password-field.spec.tsx`, in `shows a label action only when one is given`, add: clicking the action with an `onClick: (reveal) => reveal()` flips the input to `type="text"`.

- [ ] **Step 4: The dialog — spec first**

`create-user-dialog.spec.tsx`, mock the clipboard helper at the top: `vi.mock("@/shared/lib/copy-text", () => ({ copyText: vi.fn(() => Promise.resolve(true)) }))` and import `copyText` to assert on. Add:
```ts
  it("generates a password that passes the rules, reveals it and copies it", async () => {
    render(<CreateUserDialog {...props()} />);
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    const input = screen.getByLabelText(/^Password/) as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(validatePassword(input.value)).toBeNull();
    expect(copyText).toHaveBeenCalledWith(input.value);
    expect(await screen.findByText("Password copied")).toBeInTheDocument();
  });

  it("refuses a weak typed password before the gateway does", async () => {
    render(<CreateUserDialog {...props()} />);
    await userEvent.type(screen.getByLabelText("Email"), "a@x");
    await userEvent.type(screen.getByLabelText("Username"), "a");
    await userEvent.type(screen.getByLabelText(/^Password/), "s3cret!");
    await userEvent.click(screen.getByRole("button", { name: "Create user" }));
    expect(screen.getByText(/Password needs an upper-/)).toBeInTheDocument();
    expect(props().onCreate).not.toHaveBeenCalled(); // build props() once and reuse — see the file's pattern
  });
```
Update the first existing test: `"s3cret!"` → a valid password such as `"S3cret!!"` so `Create user` still enables. The toast: check how other dialog specs observe notices (`useNotices` / a `Toaster` render) and follow that, or assert `notify.success` via `vi.mock("@/shared/lib/notify")`.

`create-user-dialog.tsx`:
- `const rule = validatePassword(password); const [attempted, setAttempted] = useState(false);`
- `complete` unchanged; `submit`: `setAttempted(true); if (!complete || rule) return;`
- `PasswordField` gets `error={attempted && rule ? rule : undefined}` and
  ```tsx
  action={{
    label: "Generate",
    onClick: (reveal) => {
      const next = generatePassword();
      setPassword(next);
      reveal();
      void copyText(next).then((ok) =>
        ok ? notify.success("Password copied") : notify.error("Could not copy — select it and copy by hand"),
      );
    },
  }}
  ```
  Imports: `generatePassword, validatePassword` from `@/entities/user`; `copyText` from `@/shared/lib/copy-text`; `notify` from `@/shared/lib/notify`. Keep the file under the cap (it is ~100 lines).

- [ ] **Step 5: The two existing callers**

`use-audit.ts` copyJson: `void copyText(JSON.stringify(selected, null, 2)).then((ok) => (ok ? notify.success("Copied") : notify.error("Could not copy")));`. `recovery-codes.tsx`: `const copy = async () => { setCopied(await copyText(codesAsText(codes))); };` — and if the button label reads "Copied" from `copied`, a refusal now leaves it as "Copy"; add one spec case where `copyText` resolves false and the label stays.

- [ ] **Step 6: Lint, tests, live, commit**

`yarn lint && yarn test:coverage`. Live: Create user → Generate → the field shows a 16-char password, a toast "Password copied", paste somewhere to confirm; type `abc` → Create user → the rule message under the field.

```bash
git add frontend-v2
git commit --no-verify -m "feat(frontend-v2): Generate a password on the create-user dialog, and copy it

Frontend-only; the backend gate is skipped with --no-verify because
nothing under backend/ changes.

The auth-service password rule (8–256, four classes) is mirrored in
entities/user, ported from the old SPA with its tests. PasswordField's
action slot gets a reveal callback; Generate fills a crypto-random
16-char password, reveals it and copies it through a shared copyText,
which the audit inspector and the recovery codes now use too. A weak
typed password is refused with the rule's message before the 400.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

### Task 4: Delete a custom role

**Files:**
- Modify: `frontend-v2/src/entities/role/api/roles-gateway.ts`, `roles-gateway.spec.ts`, `frontend-v2/src/entities/role/index.ts`
- Modify: `frontend-v2/src/pages/roles/model/use-roles.ts`; Test `use-roles.spec.tsx`
- Modify: `frontend-v2/src/widgets/role-inspector/ui/role-inspector.tsx`; Test `role-inspector.spec.tsx`
- Modify: `frontend-v2/src/pages/roles/ui/roles-page.tsx`; Test `roles-page.spec.tsx`
- Modify: `frontend-v2/src/pages/roles/ui/roles-screen.tsx`; Test `roles-screen.spec.tsx`

**Interfaces:**
- Consumes: HTTP 422 with `message` from Task 1; `Role.users: number | null` from `withUserCounts`.
- Produces: `deleteRole(slug): Promise<void>`; `RolesState.askDelete()`, `RolesState.confirmDelete()`, `RolesState.dismissDelete()`, `RolesState.deleting: Role | null`, `RolesState.deletingBusy: boolean`; `RoleInspectorProps.onDelete?: () => void`, `deleteBlocked?: string`; `RolesPageProps.onDeleteRole?: () => void`, `deleteBlocked?: string`.

- [ ] **Step 1: Gateway — spec then code**

`roles-gateway.spec.ts`:
```ts
  it("deletes a role on its own route, URL-encoding the slug", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await deleteRole("field ops");
    expect(request()).toEqual({ url: "/api/auth/roles/field%20ops", method: "DELETE" });
  });
```
(match the file's `request()` helper.) `roles-gateway.ts`: `export const deleteRole = (slug: string): Promise<void> => httpDelete(at(slug));` with `httpDelete` added to the import. Export from `entities/role/index.ts`.

- [ ] **Step 2: The hook — spec then code**

`use-roles.spec.tsx` (follow the file's fetch stub pattern; add a `deleteStatus` variable to the stub, reset to 204 in `beforeEach`, and check which custom role slug the fixture uses — `field-ops` here stands for it):
```ts
  it("asks before deleting, deletes on confirm, clears the selection and says so", async () => {
    const { result } = renderHook(() => ({ s: useRoles(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => result.current.s.select("field-ops")); // a custom role in the fixture
    act(() => result.current.s.askDelete());
    expect(result.current.s.deleting?.slug).toBe("field-ops");
    act(() => result.current.s.confirmDelete());
    await waitFor(() => expect(result.current.s.deleting).toBeNull());
    expect(urls().at(-2)).toBe("/api/auth/roles/field-ops"); // the DELETE, then the roles refetch
    expect(result.current.s.selected).toBeNull();
    expect(result.current.notices.at(-1)?.message).toBe("Role deleted");
  });

  it("names the gateway's refusal and keeps the role selected", async () => {
    deleteStatus = 422; // the file's fetch stub answers DELETE with
    // {code:"unprocessable", message:"roles.Delete: role is still assigned to users"} when set
    const { result } = renderHook(() => ({ s: useRoles(), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => result.current.s.select("field-ops"));
    act(() => result.current.s.askDelete());
    act(() => result.current.s.confirmDelete());
    await waitFor(() => expect(result.current.s.deleting).toBeNull());
    expect(result.current.notices.at(-1)?.message).toBe("roles.Delete: role is still assigned to users");
    expect(result.current.s.selected?.slug).toBe("field-ops");
  });

  it("dismisses the question without deleting", async () => {
    const { result } = renderHook(() => useRoles(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("field-ops"));
    act(() => result.current.askDelete());
    act(() => result.current.dismissDelete());
    expect(result.current.deleting).toBeNull();
    expect(urls().some((u) => u === "/api/auth/roles/field-ops")).toBe(false);
  });
```
`use-roles.ts`: state `const [deletingSlug, setDeletingSlug] = useState<string | null>(null);`, `deleting = roles.data?.find((r) => r.slug === deletingSlug) ?? null`; mutation:
```ts
  const deletion = useMutation({
    mutationFn: (slug: string) => deleteRole(slug),
    onSuccess: (_, slug) => {
      notify.success("Role deleted");
      if (selectedSlug === slug) setSelectedSlug(null);
      setDrafts(({ [slug]: _dropped, ...rest }) => rest);
      void refresh();
    },
    onError: fail,
    onSettled: () => setDeletingSlug(null),
  });
```
Returned: `askDelete: () => selected && setDeletingSlug(selected.slug)`, `confirmDelete: () => deletingSlug && deletion.mutate(deletingSlug)`, `dismissDelete: () => setDeletingSlug(null)`, `deleting`, `deletingBusy: deletion.isPending`. Watch the 200-line cap: `use-roles.ts` is at 157; if the additions push past it, move `deletion` and the three callbacks into `pages/roles/model/use-role-deletion.ts` (+ spec) and compose.

- [ ] **Step 3: Inspector button — spec then code**

`role-inspector.spec.tsx`:
```ts
  it("offers Delete on a custom role nobody holds, and not on a system role or to a reader", () => {
    const { rerender } = render(<RoleInspector {...props({ role: custom({ users: 0 }), onDelete })} />);
    expect(screen.getByRole("button", { name: "Delete role" })).toBeEnabled();
    rerender(<RoleInspector {...props({ role: system(), onDelete })} />);
    expect(screen.queryByRole("button", { name: "Delete role" })).not.toBeInTheDocument();
    rerender(<RoleInspector {...props({ role: custom({ users: 0 }), onDelete, readOnly: true })} />);
    expect(screen.queryByRole("button", { name: "Delete role" })).not.toBeInTheDocument();
  });

  it("blocks Delete while people hold the role, and says how many", () => {
    render(<RoleInspector {...props({ role: custom({ users: 3 }), onDelete })} />);
    expect(screen.getByRole("button", { name: "Delete role" })).toBeDisabled();
    expect(screen.getByText("3 users hold this role — reassign them first")).toBeInTheDocument();
  });

  it("leaves Delete enabled when the count is unknown — the gateway is the guard then", () => {
    render(<RoleInspector {...props({ role: custom({ users: null }), onDelete })} />);
    expect(screen.getByRole("button", { name: "Delete role" })).toBeEnabled();
  });
```
(`props`, `custom`, `system` — build on the spec's existing fixtures.) `role-inspector.tsx`: props `onDelete?: () => void;`. Render, in the footer beside Reset/Save (left-aligned, `variant="danger"`), only when `role.kind === "custom" && !readOnly && onDelete`: 
```tsx
const holders = role.users ?? 0;
const deleteHint = holders > 0 ? `${holders} ${holders === 1 ? "user holds" : "users hold"} this role — reassign them first` : null;
<Button variant="danger" onClick={onDelete} disabled={saving || holders > 0} title={deleteHint ?? undefined}>Delete role</Button>
{deleteHint ? <p className="m-0 text-[11px] text-dim">{deleteHint}</p> : null}
```
Copy rule: the plural form in Global Constraints is for N ≥ 2; use "1 user holds this role — reassign them first" for one. Keep the file under the cap; if the footer grows past it, extract `role-inspector-footer.tsx` (+ spec + fixture is not needed for a sub-component that the widget's fixture already renders — check `architecture.spec.ts`'s rule before deciding).

- [ ] **Step 4: Page and screen — spec then code**

`roles-page.tsx`: `onDeleteRole?: () => void` passed to `<RoleInspector onDelete={onDeleteRole}>`. `roles-page.spec.tsx`: one test that the inspector's Delete reaches `onDeleteRole`.

`roles-screen.tsx`: `onDeleteRole={s.canManage ? s.askDelete : undefined}` and, beside the create dialog:
```tsx
{s.deleting ? (
  <ConfirmDialog
    open
    title={`Delete role "${s.deleting.title}"?`}
    description="Its permissions are gone with it. This cannot be undone."
    confirmLabel="Delete"
    tone="danger"
    busy={s.deletingBusy}
    onConfirm={s.confirmDelete}
    onCancel={s.dismissDelete}
  />
) : null}
```
`roles-screen.spec.tsx`: mock `useRoles` as the file does; Delete → `askDelete` called; with `deleting` set the dialog shows the title and Confirm calls `confirmDelete`.

- [ ] **Step 5: Lint, tests, live, commit**

`yarn lint && yarn test:coverage`. Live as Root: create a throwaway custom role, open it → Delete role enabled → confirm → toast, the role is gone; assign a role to a user → Delete role disabled with the hint; as a `roles:read`-only principal → no button. Note what was seen.

```bash
git add frontend-v2
git commit --no-verify -m "feat(frontend-v2): delete a custom role that nobody holds

Frontend-only; the backend gate is skipped with --no-verify because
nothing under backend/ changes.

The inspector offers Delete role on a custom role to an actor with
roles:manage; it is off with a hint while people hold the role, and the
gateway's 422 is the guard when the count is unknown. A ConfirmDialog
stands between the button and the DELETE; success clears the selection
and refetches.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

### Task 5: Final whole-package review

Review the four commits as one package against the spec (`git diff 218cf00..HEAD -- backend frontend-v2`). Findings ranked Critical / Important / Minor; Important and above get one fix wave and one scoped re-review; Minor is recorded in the ledger.
