import { useState } from "react";
import { copyText } from "@/shared/lib/copy-text";
import { notify } from "@/shared/lib/notify";
import { Button } from "@/shared/ui/button";
import { codesAsText, downloadText } from "../model/download";

export type RecoveryCodesProps = {
  codes: string[];
  /** Called once the person confirms they have stored the codes. */
  onConfirm: () => void;
};

/**
 * The codes themselves and what can be done with them. Shown once, right after
 * 2FA is enabled or regenerated: they are the only way back in if the
 * authenticator is lost, so nothing here dismisses itself.
 */
export function RecoveryCodes({ codes, onConfirm }: RecoveryCodesProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const ok = await copyText(codesAsText(codes));
    setCopied(ok);
    if (!ok) notify.error("Could not copy — select it and copy by hand");
  };

  return (
    // No card, no heading: the screen that shows these draws the green panel
    // and names the step. Drawing them again duplicated the sentence and
    // nested two ok grounds.
    <div>
      <ul className="m-0 grid list-none [grid-template-columns:repeat(auto-fit,minmax(128px,1fr))] gap-[7px] p-0">
        {codes.map((code) => (
          <li
            key={code}
            className="rounded-control-sm border border-line-2 bg-panel-2 px-1 py-[9px] text-center font-mono text-xs tracking-[0.06em] text-fg"
          >
            {code}
          </li>
        ))}
      </ul>

      <div className="mt-3.5 flex flex-wrap gap-2">
        <Button shape="pill" size="sm" onClick={copy}>
          {copied ? "Copied" : "Copy all"}
        </Button>
        <Button
          shape="pill"
          size="sm"
          onClick={() => downloadText("recovery-codes.txt", codesAsText(codes))}
        >
          Download .txt
        </Button>
        <Button shape="pill" size="sm" variant="success" onClick={onConfirm}>
          I saved them
        </Button>
      </div>
    </div>
  );
}
