import { useState } from "react";
import { CredentialsForm } from "./ui/credentials-form";
import { TwoFactorForm } from "./ui/two-factor-form";

const noop = () => {};

function Credentials({ withPasskey }: { withPasskey: boolean }) {
  const [identifier, setIdentifier] = useState("a.ivanova");
  const [password, setPassword] = useState("passwordvalue");
  const [remember, setRemember] = useState(true);

  return (
    <CredentialsForm
      identifier={identifier}
      onIdentifierChange={setIdentifier}
      password={password}
      onPasswordChange={setPassword}
      remember={remember}
      onRememberChange={setRemember}
      onSubmit={noop}
      onForgotPassword={noop}
      onPasskey={withPasskey ? noop : undefined}
    />
  );
}

function TwoFactor() {
  const [code, setCode] = useState("402");
  return (
    <TwoFactorForm
      account={{ username: "a.ivanova", email: "a.ivanova@example.com" }}
      onChangeAccount={noop}
      code={code}
      onCodeChange={setCode}
      onSubmit={noop}
      onUseRecoveryCode={noop}
      onBack={noop}
      expiresIn="0:24"
    />
  );
}

export default {
  credentials: (
    <div className="max-w-sm rounded-card border border-line bg-panel-2 p-6">
      <Credentials withPasskey />
    </div>
  ),
  withoutPasskey: (
    <div className="max-w-sm rounded-card border border-line bg-panel-2 p-6">
      <Credentials withPasskey={false} />
    </div>
  ),
  rejected: (
    <div className="max-w-sm rounded-card border border-line bg-panel-2 p-6">
      <CredentialsForm
        identifier="a.ivanova"
        onIdentifierChange={noop}
        password="wrong"
        onPasswordChange={noop}
        remember={false}
        onRememberChange={noop}
        onSubmit={noop}
        onForgotPassword={noop}
        onPasskey={noop}
        error="Invalid username or password."
      />
    </div>
  ),
  twoFactor: (
    <div className="max-w-sm rounded-card border border-line bg-panel-2 p-6">
      <TwoFactor />
    </div>
  ),
};
