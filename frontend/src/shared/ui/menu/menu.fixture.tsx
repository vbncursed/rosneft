import { Badge } from "@/shared/ui/badge";
import { Icon } from "@/shared/ui/icon";
import { Menu } from "./menu";

const noop = () => {};

export default {
  rowActions: (
    <div className="flex justify-end rounded-card border border-line bg-panel p-6">
      <Menu
        triggerLabel="Row actions"
        trigger={<Icon name="kebab" size={15} />}
        items={[
          { label: "Edit roles", onSelect: noop },
          { label: "Make Root", onSelect: noop, tone: "accent" },
          { label: "Freeze", onSelect: noop, tone: "warn" },
          { label: "Restore", onSelect: noop, tone: "ok" },
          { label: "Delete", onSelect: noop, tone: "bad" },
        ]}
      />
    </div>
  ),
  userMenu: (
    <div className="flex justify-end rounded-card border border-line bg-panel p-6">
      <Menu
        triggerLabel="Account"
        triggerClassName="rounded-full border-line-2 bg-panel-2 size-9 justify-center text-xs font-semibold text-fg"
        trigger="AI"
        header={
          <>
            <p className="m-0 text-[13px] font-semibold">a.ivanova</p>
            <p className="m-0 mt-0.5 text-[11px] text-muted">a.ivanova@example.com</p>
            <p className="m-0 mt-2">
              <Badge tone="accent" size="sm">Company Owner</Badge>
            </p>
          </>
        }
        items={[
          { label: "Console", onSelect: noop },
          { label: "Account", onSelect: noop },
          { label: "Log out", onSelect: noop, tone: "bad" },
        ]}
      />
    </div>
  ),
};
