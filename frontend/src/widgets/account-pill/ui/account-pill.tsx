import type { Viewer } from "@/shared/session";
import { Avatar } from "@/shared/ui/avatar";
import { Menu } from "@/shared/ui/menu";

export type AccountPillProps = Viewer & {
  onAccount: () => void;
  onSignOut: () => void;
};

function Identity({ username, roleTitle, size }: Viewer & { size: number }) {
  return (
    <span className="flex items-center gap-[9px]">
      <Avatar name={username} variant="soft" size={size} />
      <span className="flex flex-col items-start leading-[1.25]">
        <span className="text-xs font-medium">{username}</span>
        <span className="font-mono text-[9px] tracking-[0.1em] text-muted">{roleTitle}</span>
      </span>
    </span>
  );
}

/** The header's account menu: the pill opens an identity card over Account and Sign out. */
export function AccountPill({ username, roleTitle, onAccount, onSignOut }: AccountPillProps) {
  return (
    <Menu
      align="end"
      triggerLabel={`Account menu for ${username}`}
      triggerTooltip={false}
      triggerClassName="rounded-full border border-line-2 bg-panel py-[5px] pl-[5px] pr-[13px] text-fg transition-[border-color,scale] duration-150 ease-out hover:border-accent-line aria-expanded:border-accent-line active:scale-[0.97]"
      trigger={<Identity username={username} roleTitle={roleTitle} size={28} />}
      header={<Identity username={username} roleTitle={roleTitle} size={32} />}
      items={[
        { label: "Account", onSelect: onAccount },
        { label: "Sign out", onSelect: onSignOut },
      ]}
    />
  );
}
