import { RecoveryCodes } from "./ui/recovery-codes";

const CODES = [
  "8k2fq-p1x7d",
  "m4wla-9zt3c",
  "qq08r-vb51n",
  "7ehsy-2djk4",
  "z3ptu-r6m9e",
  "1nc4o-84wsx",
];

export default (
  <div className="max-w-sm rounded-card border border-line bg-panel p-6">
    <RecoveryCodes codes={CODES} onConfirm={() => {}} />
  </div>
);
