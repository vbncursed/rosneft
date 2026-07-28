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
      {/* keyed by pathname so the page-fade CSS animation replays per navigation */}
      <div key={pathname} className="page-fade">
        <Outlet />
      </div>
      <Toaster />
      <ConfirmModal />
    </CurrentUserProvider>
  );
}
