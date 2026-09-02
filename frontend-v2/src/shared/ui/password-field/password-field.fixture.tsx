import { PasswordField } from "./password-field";

export default (
  <div className="flex max-w-md flex-col gap-4 rounded-card border border-line bg-panel p-6">
    <PasswordField label="Password" defaultValue="passwordvalue" onGenerate={() => {}} />
    <PasswordField label="Password · shown" defaultValue="Kf7-tundra-halo" />
    <PasswordField label="New password" defaultValue="short" error="At least 12 characters" />
    <PasswordField label="Password · disabled" defaultValue="locked" disabled />
  </div>
);
