import { CoverageMeter } from "./coverage-meter";

export default (
  <div className="flex max-w-md flex-col gap-6 rounded-card border border-line bg-panel p-6">
    <CoverageMeter
      label="2FA coverage"
      detail="18 / 26"
      segments={[
        { tone: "ok", value: 18, label: "2FA + passkey" },
        { tone: "warn", value: 3, label: "2FA only" },
        { tone: "bad", value: 5, label: "password only" },
      ]}
    />
    <CoverageMeter
      label="Passkey coverage"
      detail="0 / 26"
      detailTone="bad"
      segments={[
        { tone: "ok", value: 0, label: "enrolled" },
        { tone: "bad", value: 26, label: "not enrolled" },
      ]}
    />
  </div>
);
