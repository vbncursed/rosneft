import { useSearch } from "@tanstack/react-router";
import type { Flow } from "../model/steps";
import { useTwoFactor } from "../model/use-two-factor";
import { TwoFactorPage } from "./two-factor-page";

/**
 * The route leaf. `strict: false` types the search loosely — the route's own
 * validateSearch is what guarantees the shape, and `pages` may not import
 * `app` to borrow its typed hook.
 *
 * The flow is keyed, not passed: the stage, the issued codes and the
 * provisioning guard all belong to one run of the wizard, and the stage is
 * deliberately not in the URL. Carrying them across a `?mode=` change would
 * show one flow's codes under the other's headings.
 */
export function TwoFactorScreen() {
  const { mode } = useSearch({ strict: false }) as { mode?: string };
  const flow: Flow = mode === "regenerate" ? "regenerate" : "enable";
  return <Wizard key={flow} flow={flow} />;
}

function Wizard({ flow }: { flow: Flow }) {
  return <TwoFactorPage {...useTwoFactor(flow)} />;
}
