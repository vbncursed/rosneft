import { useState } from "react";
import { RadioCards } from "./radio-card";

function Live() {
  const [value, setValue] = useState("assigned");
  return (
    <RadioCards
      label="Visibility"
      value={value}
      onChange={setValue}
      options={[
        { value: "assigned", title: "Assigned people", hint: "Only listed accounts can open this territory." },
        { value: "company", title: "Whole company", hint: "Every account in Northern Assets gets read access." },
        { value: "private", title: "Owner only", hint: "Hidden from the catalog for everyone but you." },
      ]}
    />
  );
}

export default (
  <div className="max-w-sm p-6">
    <Live />
  </div>
);
