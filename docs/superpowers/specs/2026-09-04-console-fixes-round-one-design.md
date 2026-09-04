# Console fixes, round one — six findings from a live walk-through

Date: 2026-09-04. Branch: `feat/frontend-v2-design-system` (PR #38, dev ←
branch). The user walked every console screen on the compose stack and
found seven things; the seventh (upload pages for a new territory or model
in v2) is deferred by decision and not part of this spec.

## Goal

Three rendering bugs fixed at their root in shared components, and two
small additions on existing flows: password generation with copy-to-clipboard
on the create-user dialog, and deletion of custom roles. No new screens, no
new endpoints.

## 1. Content — the row's kebab menu is cut off

`Menu` (`shared/ui/menu/menu.tsx`) draws its dropdown as `absolute z-10`
inside a `relative w-fit` wrapper; there is no portal and no flip logic
anywhere in the app. The Content row `<article>`
(`entities/content/ui/content-row.tsx:34`) carries `overflow-hidden`, whose
only job is to clip the 3px status rail (`absolute inset-y-0 left-0`)
against the row's rounded corner — and it clips the menu with it.

**Fix.** Drop `overflow-hidden` from the row; give the rail its own
`rounded-l-[11px]`. The menu opens downward as before and is no longer
clipped. No portal, no "open upward" — the user's suggestion to raise the
dropdown was a symptom read; the cause is the clip.

**Test.** `content-row.spec.tsx`: the article has no `overflow-hidden`
class, the rail has the left rounding. The screen spec that opens the row
menu already proves the items render.

## 2. Audit — the "To" calendar runs off the right edge

`DatePicker`'s popover (`shared/ui/date-picker/date-picker.tsx:83`) is
`absolute z-10 mt-1 w-[17.5rem]` with no horizontal anchor, so it sits at
the trigger's left edge and its fixed width spills past the viewport when
the trigger is the last thing in the row. The two pickers sit at the far
right of the filter row (`audit-page.tsx` filter group).

**Fix.** `DatePicker` gains `align?: "start" | "end"` (default `"start"`),
mirroring `Menu`'s prop: `end` adds `right-0`, `start` adds `left-0`. The
audit screen passes `align="end"` on **both** pickers — the From picker is
only ~120px from the edge too, and a right-anchored 280px popover fits from
either trigger.

**Test.** `date-picker.spec.tsx`: `align="end"` puts `right-0` on the
popover, default puts `left-0`. `audit-screen.spec.tsx`: both pickers
render with `align="end"` (assert on the popover class after opening one).

## 3. Users — the password field changes height on show/hide

`PasswordField` passes `mono: shown` into `controlClass`
(`shared/ui/text-field/control-class.ts:16`), which switches `font-sans
text-sm` (line-height 1.25rem) to `font-mono text-[13px]` (no line-height).
The input's height follows the line-height and jumps. The login form hides
this with a local override string (`credentials-form.tsx:13`,
`leading-[normal]!`); the create-user dialog has no override and shows the
jump.

**Fix.** In `control-class.ts` the mono branch becomes `font-mono
text-[13px] leading-5`, so both branches have the same line-height. The
login override loses `leading-[normal]!` — with the shared fix it is
redundant, and one source of truth beats two. Every `TextField mono` and
every `PasswordField` gets the fix at once.

**Test.** `control-class.spec.ts` (or `text-field.spec.tsx`, whichever
exists): the mono class string contains `leading-5`. `password-field.spec.tsx`:
toggling show/hide leaves the input's class line-height token unchanged
(jsdom has no layout; assert the class, and note that the login spec's
existing height assertion, if any, must keep passing).

## 4. Users — generate a password that passes the backend's rules

The rule lives in auth-service (`internal/validate/validate.go:67-88`):
8–256 runes, at least one upper-case, one lower-case, one digit, and one
character that is none of those. Violations come back as HTTP 400. The old
SPA already carries an exact client-side mirror with tests
(`frontend/src/auth/domain/credential-rules.ts`: `validatePassword`,
`generatePassword(len = 16)` — crypto-random, one guaranteed character per
class, Fisher–Yates shuffle). frontend-v2 has neither; its create-user
dialog only checks the password is non-empty.

**Fix.**
- Port `credential-rules.ts` and its test to
  `frontend-v2/src/entities/user/model/password-rules.ts` (+ `.spec.ts`),
  verbatim in logic, exported from `@/entities/user` as `validatePassword`
  and `generatePassword`. The header comment keeps saying it mirrors
  auth-service's validate package and must change with it.
- `create-user-dialog.tsx` uses `PasswordField`'s existing `action` slot:
  `{ label: "Generate", onClick }`. Generate fills the field with
  `generatePassword()`, reveals it (a generated password the admin cannot
  see is one they cannot hand over), and copies it — see §5.
- Submit is refused while `validatePassword(password)` returns a message;
  the message shows as the field's `error` once the field has been touched
  or a submit was attempted, so a hand-typed weak password is caught before
  the 400.

**Test.** `password-rules.spec.ts` ported. `create-user-dialog.spec.tsx`:
Generate fills a value that `validatePassword` accepts and reveals it; a
weak typed password blocks submit with the rule's message; a valid one
submits.

## 5. Users — the generated password goes to the clipboard

**Decision (user):** copy on Generate, not after creation. The admin still
has the value on screen to change their mind; a copy after the network
round-trip lacks a user gesture and browsers may refuse it.

**Fix.**
- `shared/lib/copy-text.ts`: `copyText(text: string): Promise<boolean>` —
  `navigator.clipboard.writeText`, `true` on success, `false` on rejection
  or when `navigator.clipboard` is absent. No toast inside: callers own
  their wording.
- Generate calls `copyText(password)` and toasts `Password copied` on
  `true`, `Could not copy — select it and copy by hand` on `false`.
- The two hand-rolled callers move to it: `use-audit.ts` copyJson (keeps
  its `Copied` / `Could not copy` toasts), `recovery-codes.tsx` (gains an
  error branch it never had).

**Test.** `copy-text.spec.ts`: resolves `true` when writeText resolves,
`false` when it rejects, `false` when `navigator.clipboard` is undefined.
Dialog spec: Generate calls `copyText` with the field's value (mock the
module) and toasts.

## 6. Roles — delete a custom role

`DELETE /api/auth/roles/{slug}` exists (gateway `authhttp/mount.go:58`,
`roles:manage`), system roles are refused with 422 (`ErrSystemRole`), and
the DTO already carries the operation. Nothing in frontend-v2 calls it. One
backend gap: a role still assigned to users trips the `user_roles` FK and
surfaces as a raw pgx error → HTTP 500.

**Decision (user):** deletion is refused while the role has holders; the
admin reassigns first. No cascade, no auto-unassign.

**Backend fix (auth-service).** `storage/roles/delete.go` maps SQLSTATE
`23503` (foreign-key violation) to a new sentinel `domain.ErrRoleInUse`
("role is still assigned to users"), the same shape as the existing
`23505` check in `roles/store.go`. `grpcapi` maps it to
`codes.FailedPrecondition` beside `ErrSystemRole`, which the gateway already
renders as HTTP 422 with the sentinel's message. `openapi.yaml`'s 422
description becomes "System role, or a role still assigned to users". No
gateway code change.

**Frontend fix.**
- `entities/role/api/roles-gateway.ts`: `deleteRole(slug)` →
  `httpDelete(at(slug))`.
- `use-roles.ts`: a `deletion` mutation; on success toast `Role deleted`,
  invalidate `["roles"]`, clear the selection if it was the deleted role.
  `RolesState` gains `deleteRole(slug)`, `deleting`, and
  `holdersOf(slug): number | null` — counted from the users query the page
  already runs (`null` when the viewer lacks `users:read` and the list is
  not loaded).
- Roles page inspector: a `Delete role` button (danger variant) shown only
  for `role.kind === "custom"` and only when the viewer holds
  `roles:manage`. Disabled with the hint `N users hold this role — reassign
  them first` when `holdersOf(slug) > 0`; enabled when `0`; enabled when
  `null` (the backend's 422 is the guard, and its message reaches the
  toast).
- Confirmation through the existing `ConfirmDialog` (as the Content
  delete does): title `Delete role "<title>"?`, body `Its permissions are
  gone with it. This cannot be undone.`, confirm `Delete`.
- A 422 from the gateway (system role, or holders the client could not
  count) toasts the gateway's message.

**Test.** Go: `roles` storage test for the FK mapping (integration, beside
the existing ones) and a grpcapi mapping case; `make -C backend check`.
Frontend: gateway spec (DELETE to the right path), `use-roles` spec
(mutation, invalidation, selection cleared, `holdersOf`), page spec (button
absent for system roles and without `roles:manage`; disabled with the hint
when holders exist; confirm dialog → mutation).

## Out of scope

- Upload pages for a new territory or model in v2 (deferred by the user).
- A portal-based popover layer for menus and pickers. Two anchors and one
  removed clip fix every reported case; a portal is the answer when a
  dropdown has to escape a scrolling container, and none does today.
- Password strength meter or per-rule checklist UI — the rule's single
  message is enough for an admin form.
- Cascade or bulk-reassign on role deletion.

## Order of work

1. Backend: `ErrRoleInUse` (Go, one `make check`).
2. Frontend: the three bugs (§1–3) — one commit.
3. Frontend: password rules + generate + copy (§4–5) — one commit.
4. Frontend: delete custom role (§6) — one commit.
5. Final whole-package review.
