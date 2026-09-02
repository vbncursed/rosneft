import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { codesAsText, downloadText } from "../model/download";

export type RecoveryCodesProps = {
  codes: string[];
  /** Called once the person confirms they have stored the codes. */
  onConfirm: () => void;
};

/**
 * Shown once, right after 2FA is enabled. These codes are the only way back in
 * if the authenticator is lost, so the panel does not close on its own.
 */
export function RecoveryCodes({ codes, onConfirm }: RecoveryCodesProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(codesAsText(codes));
    setCopied(true);
  };

  return (
    <div className="rounded-[10px] border border-ok bg-ok-soft p-4">
      <p className="m-0 font-mono text-[10px] uppercase tracking-[0.18em] text-ok">
        Save these recovery codes
      </p>

      <ul className="m-0 mt-3 grid list-none grid-cols-2 gap-1.5 p-0">
        {codes.map((code) => (
          <li
            key={code}
            className="rounded-control-sm bg-panel py-1.5 text-center font-mono text-xs tracking-[0.08em] text-fg"
          >
            {code}
          </li>
        ))}
      </ul>

      <div className="mt-3.5 flex flex-wrap gap-2">
        <Button shape="pill" size="sm" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          shape="pill"
          size="sm"
          onClick={() => downloadText("recovery-codes.txt", codesAsText(codes))}
        >
          Download
        </Button>
        <Button shape="pill" size="sm" variant="accent" onClick={onConfirm}>
          I saved them
        </Button>
      </div>
    </div>
  );
}
