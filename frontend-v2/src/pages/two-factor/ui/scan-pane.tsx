import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { copyText } from "@/shared/lib/copy-text";
import { notify } from "@/shared/lib/notify";
import { Skeleton } from "@/shared/ui/skeleton";

export type ScanPaneProps = { secret: string; otpauthUrl: string };

/**
 * The left half of the enable wizard: pair an authenticator with the pending
 * secret. The manual key is the same credential in typeable form, folded away
 * until someone needs it — a phone camera is the common path.
 */
export function ScanPane({ secret, otpauthUrl }: ScanPaneProps) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const ok = await copyText(secret);
    setCopied(ok);
    if (!ok) notify.error("Could not copy — select it and copy by hand");
  };

  return (
    <div className="flex flex-col items-center gap-4 border-b border-line bg-panel-2 p-[26px] text-center sm:border-b-0 sm:border-r">
      <p className="m-0 self-start font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
        Step 1 · scan
      </p>

      <div className="flex size-[172px] items-center justify-center rounded-[12px] border border-line-2 bg-panel">
        {otpauthUrl ? (
          // White ground, black modules, in both themes: a camera reads
          // contrast, not the palette, and a QR toned to the dark theme is a
          // pretty square that will not scan.
          <QRCodeSVG
            value={otpauthUrl}
            size={148}
            marginSize={2}
            bgColor="#ffffff"
            fgColor="#000000"
            title="Two-factor pairing QR code"
          />
        ) : (
          // Skeleton is decorative by construction (aria-hidden); the wait
          // itself is what has to be announced, so the role sits on the wrapper.
          <div role="status" aria-label="Preparing the QR code">
            <Skeleton width="148px" height="148px" rounded="md" />
          </div>
        )}
      </div>

      <p className="m-0 text-xs leading-[1.55] text-muted">
        Scan with 1Password, Google Authenticator, or any TOTP app.
      </p>

      <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          aria-expanded={shown}
          onClick={() => setShown((open) => !open)}
          className="cursor-pointer border-none bg-transparent p-0 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Can't scan? Show manual key
        </button>

        {shown ? (
          <div className="flex items-center gap-2 rounded-[9px] border border-line-2 bg-panel px-[11px] py-[9px]">
            <code className="min-w-0 flex-1 break-all text-left font-mono text-[11px] text-fg">
              {secret}
            </code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 cursor-pointer rounded-full border border-line-2 bg-transparent px-[11px] py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-fg hover:border-accent-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
