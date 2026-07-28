import { Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { meQuery } from "@/auth/application/me-query";
import { CurrentUserProvider } from "@/auth/presentation/current-user-context";
import UserMenu from "@/app-shell/user-menu";
import Toaster from "@/shared/presentation/toast/toaster";
import ConfirmModal from "@/shared/presentation/confirm/confirm-modal";

export default function AppLayout() {
  const { data: me } = useQuery(meQuery);
  const { pathname } = useLocation();
  return (
    <CurrentUserProvider value={me ?? null}>
      {me ? <UserMenu /> : null}
      {/* Keyed by pathname so route-local state (snap toggle, reset counter…)
          doesn't survive into the next page. The fade lives on #root instead:
          replaying it here meant every navigation faded the whole page in from
          transparent, which read as the browser reloading. */}
      <div key={pathname}>
        <Outlet />
      </div>
      <Toaster />
      <ConfirmModal />
    </CurrentUserProvider>
  );
}
