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
  companyId: "",
  companyLogin: "",
  action,
  entity: "session",
  entityId: `e-${id}`,
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
  event(8, "auth.2fa_regenerate", "2026-09-07T08:41:00Z"),
  event(7, "territory.replace_source", "2026-09-06T18:20:00Z", {
    entity: "territory",
    entityLabel: "Refinery Block C",
    territorySlug: "refinery-block-c",
  }),
  event(6, "model.create", "2026-09-06T16:02:00Z", { entity: "model", entityLabel: "valve-assembly" }),
  event(5, "placement.update", "2026-09-05T11:37:00Z", {
    entity: "placement",
    entityLabel: "Storage Tank 500",
    territorySlug: "refinery-block-c",
  }),
  event(4, "auth.passkey_delete", "2026-07-03T09:20:00Z", {
    entity: "credential",
    entityLabel: "YubiKey 5C",
    result: "failed",
  }),
];

const noop = async () => {};

const base: AccountPageProps = {
  me: ME,
  twoFactor: TWO_FACTOR,
  passkeys: PASSKEYS,
  twoFactorLoading: false,
  passkeysLoading: false,
  activity: ACTIVITY,
  activityHasMore: true,
  activityBusy: false,
  passwordBusy: false,
  disableBusy: false,
  removalBusy: false,
  onChangePassword: noop,
  onDisable2FA: noop,
  onRemovePasskey: noop,
  onPasskeyAdded: () => {},
  onLoadMore: () => {},
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
  "empty activity": shell({ activity: [], activityHasMore: false }),
  loading: shell({
    twoFactor: null,
    passkeys: null,
    twoFactorLoading: true,
    passkeysLoading: true,
    activity: [],
    activityHasMore: false,
  }),
};
