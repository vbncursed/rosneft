import { TwoFactorRequiredPage } from "./ui/two-factor-required-page";

// Full-page fixtures: the screen draws its own header, so no padding wrapper.
export default {
  gate: (
    <TwoFactorRequiredPage stage="gate" username="a.ivanova" onSignOut={() => {}} signingOut={false} />
  ),
  done: (
    <TwoFactorRequiredPage stage="done" username="a.ivanova" onSignOut={() => {}} signingOut={false} />
  ),
};
