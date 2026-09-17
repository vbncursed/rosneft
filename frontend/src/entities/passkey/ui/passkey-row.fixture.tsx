import { PasskeyRow } from "./passkey-row";
import type { Passkey } from "../model/passkey";

const noop = () => {};

const ROWS: { passkey: Passkey; busy?: boolean }[] = [
  { passkey: { id: "k1", name: "MacBook Pro", createdAt: "2026-08-12T09:20:00Z", lastUsedAt: "2026-09-07T18:02:00Z" } },
  { passkey: { id: "k2", name: "iPhone 15", createdAt: "2026-07-03T09:20:00Z", lastUsedAt: "2026-09-06T06:00:00Z" } },
  { passkey: { id: "k3", name: "YubiKey 5C", createdAt: "2026-07-03T09:20:00Z", lastUsedAt: null }, busy: true },
];

export default (
  <div className="flex flex-col gap-[9px] p-6">
    {ROWS.map(({ passkey, busy }) => (
      <PasskeyRow key={passkey.id} passkey={passkey} onRemove={noop} busy={busy} />
    ))}
  </div>
);
