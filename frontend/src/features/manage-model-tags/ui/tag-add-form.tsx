import { useState, type FormEvent } from "react";
import { slugError, titleError } from "@/entities/model-tag";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/text-field";
import type { Outcome } from "../model/use-model-tags-admin";

export type TagAddFormProps = {
  onCreate: (input: { slug: string; title: string }) => Promise<Outcome>;
};

/** Slug and title for a new tag; the client checks mirror the server's, a refusal prints under the form. */
export function TagAddForm({ onCreate }: TagAddFormProps) {
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [touched, setTouched] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const slugProblem = slugError(slug);
  const titleProblem = titleError(title);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (slugProblem || titleProblem || busy) return;
    setBusy(true);
    const outcome = await onCreate({ slug, title });
    setBusy(false);
    setRefusal(outcome);
    if (outcome === null) {
      setSlug("");
      setTitle("");
      setTouched(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      data-tour="content-tag-add"
      className="flex flex-col gap-2 border-t border-line px-4 py-3"
    >
      <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
        <TextField
          mono
          compact
          label="Slug"
          value={slug}
          error={touched ? slugProblem : null}
          disabled={busy}
          autoComplete="off"
          onChange={(e) => setSlug(e.target.value)}
        />
        <TextField
          compact
          label="Title"
          value={title}
          error={touched ? titleProblem : null}
          disabled={busy}
          autoComplete="off"
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button type="submit" variant="primary" size="sm" loading={busy} className="sm:mt-[18px]">
          Add tag
        </Button>
      </div>
      {refusal ? (
        <p role="alert" className="m-0 text-[11px] text-bad">
          {refusal}
        </p>
      ) : null}
    </form>
  );
}
