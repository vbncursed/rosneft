import { useId } from "react";
import { DOCUMENTS_OVERLINE, documentsCount, UPLOAD_DOCUMENT_TITLE } from "../model/copy";
import type { SectionFold } from "../model/use-section-folds";
import { DocumentRow } from "./document-row";
import { SectionHead } from "./section-head";

export type DocumentsSectionProps = {
  rows: { id: number; name: string; /** Aligned to the model. */ aligned: boolean }[];
  canUpload: boolean;
  onUpload: () => void;
  onOpen: (id: number) => void;
  /** `zone:write` only: Align plan / Edit zones on a row. */
  onAlign?: (id: number) => void;
  fold: SectionFold;
};

const LIST = "m-0 flex list-none flex-col gap-[9px] p-0";

/** The View tab's PDFs: the rows fold behind the head, and each opens over the scene or goes to the plan editor. */
export function DocumentsSection({ rows, canUpload, onUpload, onOpen, onAlign, fold }: DocumentsSectionProps) {
  const listId = useId();
  return (
    <section id="view-tab-documents" aria-label={DOCUMENTS_OVERLINE} className="flex flex-col gap-[9px]">
      <SectionHead
        overline={DOCUMENTS_OVERLINE}
        count={documentsCount(rows.length)}
        // An empty list has nothing to open, so its head stays a plain head.
        fold={rows.length > 0 ? { ...fold, controls: listId } : undefined}
        upload={canUpload ? { title: UPLOAD_DOCUMENT_TITLE, tourId: "add-document", onClick: onUpload } : undefined}
      />
      {rows.length > 0 ? (
        <ul id={listId} hidden={!fold.open} role="list" className={LIST}>
          {fold.open
            ? rows.map((row) => (
                <li key={row.id}>
                  <DocumentRow id={row.id} name={row.name} onOpen={onOpen} onAlign={onAlign} aligned={row.aligned} />
                </li>
              ))
            : null}
        </ul>
      ) : null}
    </section>
  );
}
