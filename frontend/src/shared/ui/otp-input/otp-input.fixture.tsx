import { useState } from "react";
import { OtpInput } from "./otp-input";

function Live() {
  const [value, setValue] = useState("402");
  return <OtpInput value={value} onChange={setValue} />;
}

export default {
  states: (
    <div className="flex flex-col gap-2.5 rounded-card border border-line bg-panel p-6">
      <OtpInput value="" onChange={() => {}} />
      <OtpInput value="402" onChange={() => {}} />
      <OtpInput value="402917" onChange={() => {}} />
      <OtpInput value="" onChange={() => {}} disabled />
    </div>
  ),
  interactive: (
    <div className="rounded-card border border-line bg-panel p-6">
      <Live />
    </div>
  ),
};
