import { useState } from "react";
import { createDocument, isPdfSignature, type Document } from "@/entities/document";
import { useFileUpload } from "@/entities/upload";
import { notify } from "@/shared/lib/notify";

export type DocumentUploadParams = {
  slug: string;
  onCreated: (document: Document) => void;
};

const REFUSAL = "Please choose a PDF file.";

/** The document upload: sniff the %PDF magic, stream the bytes, attach the row. */
export function useDocumentUpload({ slug, onCreated }: DocumentUploadParams) {
  const upload = useFileUpload({
    sniff: isPdfSignature,
    refusal: REFUSAL,
    // "%PDF-" is five bytes; the eight-byte default would still sniff, but it
    // says what this file is checked against.
    headBytes: 5,
    uploadingLabel: (percent) => `Uploading · ${percent} %`,
  });
  const [title, setTitle] = useState("");

  const trimmed = title.trim();
  const canSubmit = trimmed !== "" && upload.state.stage === "picked";

  const submit = async () => {
    if (!canSubmit) return;
    await upload.run(async (blob) => {
      const document = await createDocument(slug, { title: trimmed, sourceBlobHash: blob.hash });
      notify.success("Document uploaded");
      // Emptied on success only — the hook lives on the page, so the next
      // upload would otherwise inherit this title; a refusal keeps it to retry.
      setTitle("");
      onCreated(document);
    });
  };

  return {
    upload: upload.state,
    title,
    setTitle,
    pick: (files: File[]) => (files[0] ? upload.pick(files[0]) : Promise.resolve()),
    clear: upload.clear,
    cancel: upload.cancel,
    submit,
    canSubmit,
  };
}
