import { StatsRow } from "./ui/stats-row";

export default (
  <div className="p-6">
    <StatsRow
      meter={{
        label: "2FA coverage",
        detail: "18 / 26",
        segments: [
          { label: "Enrolled", value: 18, tone: "ok" },
          { label: "Missing", value: 8, tone: "warn" },
        ],
      }}
      stats={[
        { label: "People", value: "26", hint: "2 frozen" },
        { label: "Roles", value: "5", hint: "1 custom" },
        { label: "Frozen", value: "2", hint: "need review", tone: "warn" },
      ]}
    />
  </div>
);
