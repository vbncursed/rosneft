import { Callout } from "./callout";

export default (
  <div className="flex max-w-md flex-col gap-2.5 rounded-card border border-line bg-panel p-6">
    <Callout tone="bad">No 2FA and no passkey — password only.</Callout>
    <Callout tone="warn">You cannot grant a permission you do not have.</Callout>
    <Callout tone="accent">This role is assigned from the Users page.</Callout>
    <Callout tone="ok" icon="eye">
      Every change on this territory is recorded.
    </Callout>
    <Callout tone="warn" icon="warning" size="lg">
      <>
        <strong className="block text-[13px] font-semibold">The territory goes back to converting</strong>
        <span className="mt-[5px] block text-xs leading-[1.5] text-fg">
          While the new mesh is processed the viewer shows the conversion screen.
        </span>
      </>
    </Callout>
  </div>
);
