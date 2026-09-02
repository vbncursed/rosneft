import { Sparkline } from "./sparkline";

const DAY = [12, 18, 9, 6, 4, 5, 11, 24, 31, 38, 44, 39, 47, 52, 41, 36, 44, 29, 22, 17, 12, 9, 14, 8];

export default (
  <div className="p-6 flex max-w-lg flex-col gap-4">
    <Sparkline values={DAY} label="Events" detail="peak 41/h" dimFrom={18} />
    <Sparkline values={[0, 0, 0, 0]} label="Events" detail="quiet" />
    <Sparkline values={[]} label="Events" />
  </div>
);
