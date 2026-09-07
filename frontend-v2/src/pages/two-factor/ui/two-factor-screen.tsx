import { useSearch } from "@tanstack/react-router";
import { useTwoFactor } from "../model/use-two-factor";
import { TwoFactorPage } from "./two-factor-page";

/**
 * The route leaf. `strict: false` types the search loosely — the route's own
 * validateSearch is what guarantees the shape, and `pages` may not import
 * `app` to borrow its typed hook.
 */
export function TwoFactorScreen() {
  const { mode } = useSearch({ strict: false }) as { mode?: string };
  return <TwoFactorPage {...useTwoFactor(mode === "regenerate" ? "regenerate" : "enable")} />;
}
