import { useSignOut } from "@/features/sign-out";
import { desktopBridge } from "@/shared/lib/desktop";
import { ErrorState } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import { useAccount } from "../model/use-account";
import { useDeviceStorage } from "../model/use-device-storage";
import { AccountPage } from "./account-page";
import { StorageSection } from "./storage-section";

/** Maps the container's phases onto the page: loading skeleton, error state, or the page itself. */
export function AccountScreen() {
  const s = useAccount();
  const { signOut, pending: signingOut } = useSignOut();
  const device = useDeviceStorage();

  if (s.phase === "loading") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading account"
        className="mx-auto flex w-full max-w-[880px] flex-col gap-5"
      >
        <Skeleton height="88px" />
        <Skeleton height="120px" />
        <Skeleton height="260px" />
      </div>
    );
  }

  if (s.phase === "unavailable") {
    return (
      <div className="mx-auto w-full max-w-[880px]">
        <ErrorState title="Account unavailable" detail={s.error} />
      </div>
    );
  }

  return (
    <AccountPage
      me={s.me}
      twoFactor={s.twoFactor}
      passkeys={s.passkeys}
      twoFactorLoading={s.twoFactorLoading}
      passkeysLoading={s.passkeysLoading}
      activity={s.activity}
      activityTotal={s.activityTotal}
      activityPage={s.activityPage}
      activityPageCount={s.activityPageCount}
      activityBusy={s.activityBusy}
      passwordBusy={s.passwordBusy}
      disableBusy={s.disableBusy}
      removalBusy={s.removalBusy}
      onChangePassword={s.onChangePassword}
      onDisable2FA={s.onDisable2FA}
      onRemovePasskey={s.onRemovePasskey}
      onPasskeyAdded={s.onPasskeyAdded}
      onPage={s.onPage}
      onSignOut={() => void signOut()}
      signingOut={signingOut}
      storage={
        desktopBridge() ? (
          <StorageSection
            usage={device.usage}
            usageFailed={device.usageFailed}
            savedLoaded={device.savedLoaded}
            saved={device.saved}
            onLimit={device.setLimit}
            onClear={device.clear}
            onRemove={device.remove}
          />
        ) : undefined
      }
    />
  );
}
