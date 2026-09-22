import { AccountPill } from "./ui/account-pill";

const noop = () => {};

export default (
  <div className="flex justify-end p-6">
    <AccountPill username="a.ivanova" roleTitle="Company Owner" onAccount={noop} onSignOut={noop} />
  </div>
);
