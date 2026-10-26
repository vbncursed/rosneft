import { useId } from "react";
import { Button } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import { Field } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { SectionHeading } from "@/shared/ui/section-heading";
import { controlClass } from "@/shared/ui/text-field";
import type { ZoneEditor } from "../model/use-zone-editor";

export type AlignPanelProps = { editor: Pick<ZoneEditor, "status" | "page" | "pageCount" | "setPage" | "alignment"> };

/** The plan-to-model alignment: pairs and their residuals, how well they fit, and the scale check. */
export function AlignPanel({ editor }: AlignPanelProps) {
  const { status, page, pageCount, setPage, alignment: a } = editor;
  const pageId = useId();
  if (status === "error") {
    return <Callout tone="bad">The plan could not be read. Close it and open it again.</Callout>;
  }
  return (
    <section aria-label="Align plan" className="flex flex-col gap-3.5">
      <SectionHeading as="h3" title="Align plan" />
      {pageCount > 1 ? (
        <Field id={pageId} label="Page">
          <select
            id={pageId}
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
            className={controlClass({ invalid: false })}
          >
            {Array.from({ length: pageCount }, (_, i) => (
              <option key={i} value={i + 1}>
                Page {i + 1} of {pageCount}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {status === "loading" ? <p className="m-0 text-[12px] text-muted">Reading the plan…</p> : null}
      {a.notice ? <Callout tone="neutral">{a.notice}</Callout> : null}
      {a.awaitingScenePick ? (
        <>
          <Callout tone="accent">Now click the same spot on the model.</Callout>
          <Button size="sm" variant="secondary" onClick={a.cancelPending} className="self-start">
            Cancel this point
          </Button>
        </>
      ) : (
        <p className="m-0 text-[12px] text-muted">
          Click a spot on the plan, then the same spot on the model. Drag a marker to fine-tune it.
        </p>
      )}
      {a.pairs.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {a.pairs.map((_, i) => (
            // oxlint-disable-next-line react/no-array-index-key -- a pair has no id; its position is its number
            <li key={i} className="flex items-center gap-2 font-mono text-[11px] text-fg">
              <span>Pair {i + 1}</span>
              <span className="flex-1 text-right text-muted">
                {a.residualsM[i] === undefined ? "" : `${a.residualsM[i].toFixed(2)} m off`}
              </span>
              <Button
                shape="icon"
                size="xs"
                variant="ghost"
                aria-label={`Remove pair ${i + 1}`}
                onClick={() => a.removePair(i)}
              >
                <Icon name="close" size={11} />
              </Button>
            </li>
          ))}
        </ol>
      ) : null}
      {a.fitLine ? <p className="m-0 text-[12px] text-ok">{a.fitLine}</p> : null}
      {a.error ? (
        a.fit && !a.fit.ok && a.fit.reason === "too-few" ? (
          <p className="m-0 text-[12px] text-muted">{a.error}</p>
        ) : (
          <Callout tone="bad">{a.error}</Callout>
        )
      ) : null}
      {a.scaleLine ? <Callout tone={a.scaleWarn ? "warn" : "ok"}>{a.scaleLine}</Callout> : null}
      <div className="flex gap-2">
        <Button variant="primary" disabled={!a.canSave} loading={a.saving} onClick={() => void a.save()}>
          Save alignment
        </Button>
        <Button variant="secondary" onClick={() => void a.clear()}>
          Clear alignment
        </Button>
      </div>
    </section>
  );
}
