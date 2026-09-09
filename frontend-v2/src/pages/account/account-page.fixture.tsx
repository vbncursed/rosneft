import type { AuditEntry } from "@/entities/audit";
import type { Principal } from "@/shared/session";
import { CatalogShell } from "@/widgets/catalog-shell";
import { AccountPage, type AccountPageProps } from "./ui/account-page";

const ME: Principal = {
  id: "u-1",
  email: "a.ivanova@example.com",
  username: "a.ivanova",
  status: "active",
  totpEnabled: true,
  totpRequired: false,
  passkeyEnabled: true,
  roleSlugs: ["admin"],
  roleTitles: { admin: "Company Owner" },
  permissions: [],
  isOwner: true,
  onboardingToursSeen: [],
};

const TWO_FACTOR = { enabled: true, enabledAt: "2026-08-12T09:20:00Z", recoveryRemaining: 7, recoveryTotal: 10 };
const TWO_FACTOR_OFF = { enabled: false, enabledAt: null, recoveryRemaining: 0, recoveryTotal: 0 };

const PASSKEYS = [
  { id: "p-1", name: "MacBook Pro", createdAt: "2026-08-12T09:20:00Z", lastUsedAt: "2026-09-07T09:14:00Z" },
  { id: "p-2", name: "iPhone 15", createdAt: "2026-07-03T09:20:00Z", lastUsedAt: "2026-09-06T09:20:00Z" },
];

const event = (id: number, action: string, at: string, over: Partial<AuditEntry> = {}): AuditEntry => ({
  id,
  at,
  actorId: "u-1",
  actorLogin: "a.ivanova",
  // A Company Owner's own rows carry its own id and login here, as the live
  // journal returns them.
  companyId: "u-1",
  companyLogin: "a.ivanova",
  action,
  // The shape every auth.* row really has: entity "session", and entityId,
  // entityLabel and territorySlug all empty. Copied off a live
  // GET /api/audit/mine rather than invented — the previous set gave passkey
  // rows an entityLabel of "YubiKey 5C", a value the gateway never writes for
  // them, which is what hid the second line printing "session" for nine
  // reviews.
  entity: "session",
  entityId: "",
  entityLabel: "",
  territorySlug: "",
  oldRow: null,
  newRow: null,
  result: "ok",
  ...over,
});

// Anchored to the mock's own clock rather than to "now": the relative labels
// are what this fixture is for, and a fixed set of instants keeps yesterday
// yesterday. Shown relative to whenever it is opened, so the top rows read as
// older than the mock — that is the function working, not sample data rotting.
const ACTIVITY: AuditEntry[] = [
  event(9, "auth.login", "2026-09-07T09:14:00Z"),
  event(8, "auth.2fa_recovery_regenerate", "2026-09-07T08:41:00Z"),
  // A refused change is journalled too, with result "failed" and nothing else
  // to say — the one auth row that still draws a second line.
  event(7, "auth.password_change", "2026-09-07T08:02:00Z", { result: "failed" }),
  event(6, "auth.passkey_register", "2026-09-06T18:20:00Z"),
  // The catalog rows do label themselves: territory.insert carries the slug in
  // entityLabel, model.insert the model's slug, and the id is the row's.
  event(5, "territory.insert", "2026-09-06T16:02:00Z", {
    entity: "territory",
    entityId: "39",
    entityLabel: "refinery-block-c",
  }),
  event(4, "model.insert", "2026-09-05T11:37:00Z", {
    entity: "model",
    entityId: "61",
    entityLabel: "valve-assembly",
  }),
  // territorySlug is filled for the entities whose row carries a parent —
  // placement, panorama, document, territory_assignment — and resolved on
  // read (openapi AuditEntry.territorySlug). Nothing on this box has placed a
  // model, so this row is built from that contract rather than observed.
  event(3, "placement.update", "2026-09-05T09:10:00Z", {
    entity: "placement",
    entityId: "118",
    entityLabel: "Storage Tank 500",
    territorySlug: "refinery-block-c",
  }),
  // Nine rows: two pages of six, the second one short — which is what the
  // summary's last-page arithmetic and the pager's edge both need to show.
  event(2, "auth.2fa_enable", "2026-07-03T09:20:00Z"),
  event(1, "auth.login", "2026-07-03T09:18:00Z"),
];

const noop = async () => {};

const base: AccountPageProps = {
  me: ME,
  twoFactor: TWO_FACTOR,
  passkeys: PASSKEYS,
  twoFactorLoading: false,
  passkeysLoading: false,
  activity: ACTIVITY.slice(0, 6),
  activityTotal: ACTIVITY.length,
  activityPage: 1,
  activityPageCount: 2,
  activityBusy: false,
  passwordBusy: false,
  disableBusy: false,
  removalBusy: false,
  onChangePassword: noop,
  onDisable2FA: noop,
  onRemovePasskey: noop,
  onPasskeyAdded: () => {},
  onPage: () => {},
};

const shell = (over: Partial<AccountPageProps>) => (
  <CatalogShell>
    <AccountPage {...base} {...over} />
  </CatalogShell>
);

export default {
  ready: shell({}),
  "2fa on": shell({}),
  "2fa off": shell({ twoFactor: TWO_FACTOR_OFF, me: { ...ME, totpEnabled: false } }),
  "2fa unknown": shell({ twoFactor: null }),
  "no passkeys": shell({ passkeys: [] }),
  "passkeys unavailable": shell({ passkeys: null }),
  // The short last page — six rows loaded, three drawn, the summary reading
  // the remainder rather than the count on screen.
  "page 2": shell({ activity: ACTIVITY.slice(6), activityPage: 2 }),
  // A cursor page that never arrived: the journal holds nine events, this page
  // holds none, and the pager stays so the reader can get back.
  "activity page failed": shell({ activity: [], activityPage: 2 }),
  "empty activity": shell({ activity: [], activityTotal: 0, activityPageCount: 1 }),
  // What a Guest sees: no audit:read_own, so the feed 403s.
  "activity unavailable": shell({ activity: null, activityTotal: null }),
  loading: shell({
    twoFactor: null,
    passkeys: null,
    twoFactorLoading: true,
    passkeysLoading: true,
    // A page on its way: skeleton rows where the six go, the pager waiting.
    activity: [],
    activityBusy: true,
  }),
};
