import type { TwoFactorState } from "../model/use-two-factor";
import { TwoFactorPage } from "./two-factor-page";

const CODES = [
  "8k2fq-p1x7d", "m4wla-9zt3c", "qq08r-vb51n", "7dj4e-x2m9s", "p05tz-k8w1r",
  "3nv6y-c7q2h", "z91bd-t4l6m", "wj5r0-a3f8k", "6hs2x-n0p5v", "e4c7u-y1g3b",
];

const base: TwoFactorState = {
  flow: "enable",
  stage: "confirm",
  secret: "JBSWY3DPEHPK3PXP",
  otpauthUrl: "otpauth://totp/Andrey:a.ivanova?secret=JBSWY3DPEHPK3PXP&issuer=Andrey",
  code: "",
  codes: [],
  error: null,
  busy: false,
  username: "a.ivanova",
  onCode: () => {},
  onConfirm: () => {},
  onDone: () => {},
  onCancel: () => {},
};

export default {
  "enable · confirm": <TwoFactorPage {...base} />,
  "enable · confirm · error": (
    <TwoFactorPage
      {...base}
      code=""
      error="Invalid code — check your device clock and try the next one."
    />
  ),
  "enable · codes": <TwoFactorPage {...base} stage="codes" codes={CODES} />,
  "regenerate · confirm": <TwoFactorPage {...base} flow="regenerate" code="4821" />,
  "regenerate · codes": <TwoFactorPage {...base} flow="regenerate" stage="codes" codes={CODES} />,
  "enable · already on": (
    <TwoFactorPage {...base} error="Two-factor is already on for this account." />
  ),
};
