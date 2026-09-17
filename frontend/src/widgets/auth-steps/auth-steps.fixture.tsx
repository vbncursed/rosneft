import { useState } from "react";
import { AuthSteps } from "./ui/auth-steps";

const STEPS = [
  { key: "creds", label: "1 · identity" },
  { key: "2fa", label: "2 · second factor" },
];

function Live() {
  const [current, setCurrent] = useState("creds");
  return (
    <div className="flex flex-col gap-3">
      <AuthSteps steps={STEPS} current={current} />
      <button
        type="button"
        className="w-fit cursor-pointer rounded-control border border-line-2 bg-panel-2 px-3 py-1.5 text-xs text-fg"
        onClick={() => setCurrent((c) => (c === "creds" ? "2fa" : "creds"))}
      >
        next step
      </button>
    </div>
  );
}

export default (
  <div className="max-w-sm p-6">
    <Live />
  </div>
);
