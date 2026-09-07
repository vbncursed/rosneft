import type { Principal } from "@/shared/session";
import { CatalogShell } from "@/widgets/catalog-shell";
import { AccountPage } from "./ui/account-page";

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

const PASSKEYS = [
  { id: "p-1", name: "MacBook Pro", createdAt: "2026-08-12T09:20:00Z", lastUsedAt: "2026-09-07T09:14:00Z" },
  { id: "p-2", name: "iPhone 15", createdAt: "2026-07-03T09:20:00Z", lastUsedAt: "2026-09-06T09:20:00Z" },
];

const noop = async () => {};

export default {
  ready: (
    <CatalogShell>
      <AccountPage
        me={ME}
        twoFactor={TWO_FACTOR}
        passkeys={PASSKEYS}
        twoFactorLoading={false}
        passkeysLoading={false}
        passwordBusy={false}
        onChangePassword={noop}
      />
    </CatalogShell>
  ),
  "2fa unknown": (
    <CatalogShell>
      <AccountPage
        me={ME}
        twoFactor={null}
        passkeys={PASSKEYS}
        twoFactorLoading={false}
        passkeysLoading={false}
        passwordBusy={false}
        onChangePassword={noop}
      />
    </CatalogShell>
  ),
  "no passkeys": (
    <CatalogShell>
      <AccountPage
        me={ME}
        twoFactor={TWO_FACTOR}
        passkeys={[]}
        twoFactorLoading={false}
        passkeysLoading={false}
        passwordBusy={false}
        onChangePassword={noop}
      />
    </CatalogShell>
  ),
  loading: (
    <CatalogShell>
      <AccountPage
        me={ME}
        twoFactor={null}
        passkeys={null}
        twoFactorLoading
        passkeysLoading
        passwordBusy={false}
        onChangePassword={noop}
      />
    </CatalogShell>
  ),
};
