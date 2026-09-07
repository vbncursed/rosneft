import { clsx as cx } from "clsx";
import type { TwoFactorStatus } from "@/entities/user";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import { DetailList } from "@/shared/ui/detail-list";
import { SectionHeading } from "@/shared/ui/section-heading";
import { Skeleton } from "@/shared/ui/skeleton";
import { dayOf } from "../model/activity";

export type TwoFactorSectionProps = {
  /** null is "we could not find out" — never "off". */
  status: TwoFactorStatus | null;
  /** Still asking. Distinct from null, which is an answer we failed to get. */
  loading: boolean;
  onDisable: () => void;
};

const WIZARD = "/account/two-factor";

const ENABLE_LEDE =
  "Sign-in asks for your password alone. Turning two-factor on adds a code from your authenticator app.";
// Not the mock's "asks for your password first": POST /api/auth/2fa/disable
// accepts a current TOTP code and nothing else, so the mock's wording would
// send the user looking for the wrong thing.
const DISABLE_LEDE =
  "A time-based code from your authenticator app is required at every sign-in. Turning it off asks for a code from that app.";

/** The link-shaped controls; Button is a <button>, and these navigate. */
function LinkAction({ href, children, tone }: { href: string; children: string; tone: "accent" | "warn" }) {
  return (
    <a
      href={href}
      className={cx(
        "w-fit rounded-control border px-3.5 py-[7px] font-mono text-[10px] uppercase tracking-[0.12em] no-underline",
        tone === "accent"
          ? "border-accent bg-accent-soft text-accent hover:bg-accent/20"
          : "border-warn text-warn hover:bg-warn/10",
      )}
    >
      {children}
    </a>
  );
}

/** The 2FA panel: enabled, off, or a status we could not read. */
export function TwoFactorSection({ status, loading, onDisable }: TwoFactorSectionProps) {
  const on = status?.enabled === true;

  return (
    <section
      className={cx(
        // One border-colour utility, chosen here — stacking border-line with
        // an override lets the compiled stylesheet's source order decide.
        "flex flex-col gap-4 rounded-card border bg-panel p-[22px]",
        on ? "border-ok" : "border-line",
      )}
    >
      <SectionHeading
        title="Two-factor authentication"
        count={
          loading ? undefined : (
            <Badge tone={on ? "ok" : "dim"} size="sm">
              {status === null ? "unknown" : on ? "enabled" : "off"}
            </Badge>
          )
        }
      />

      {loading ? (
        <div role="status" aria-busy="true" aria-label="Loading two-factor status">
          <Skeleton height="72px" />
        </div>
      ) : status === null ? (
        <Callout tone="warn">Two-factor status is unavailable right now.</Callout>
      ) : (
        <>
          <p className="m-0 max-w-[64ch] text-[13px] leading-[1.6] text-muted">
            {on ? DISABLE_LEDE : ENABLE_LEDE}
          </p>
          {on ? (
            <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
              <div className="flex flex-col gap-[11px] rounded-[11px] border border-line bg-panel-2 p-4">
                <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">Authenticator</p>
                <DetailList
                  items={[
                    // Dropped rather than guessed when the server never
                    // recorded the moment.
                    ...(status.enabledAt ? [{ label: "added", value: dayOf(status.enabledAt) }] : []),
                    { label: "algorithm", value: "TOTP · SHA1 · 6 digits" },
                  ]}
                />
                <Button variant="danger" size="sm" className="mt-auto w-fit" onClick={onDisable}>
                  Disable 2FA
                </Button>
              </div>
              <div className="flex flex-col gap-[11px] rounded-[11px] border border-warn bg-warn-soft p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-warn">Recovery codes</p>
                  <p className="m-0 font-mono text-[11px] text-warn">shown once at generation</p>
                </div>
                <p className="m-0 font-mono text-[13px] text-fg">
                  {status.recoveryRemaining} of {status.recoveryTotal} codes left
                </p>
                <LinkAction href={`${WIZARD}?mode=regenerate`} tone="warn">
                  Regenerate recovery codes
                </LinkAction>
              </div>
            </div>
          ) : (
            <LinkAction href={WIZARD} tone="accent">
              Enable two-factor
            </LinkAction>
          )}
        </>
      )}
    </section>
  );
}
