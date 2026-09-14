import { controlClass } from "@/shared/ui/text-field";
import { Field } from "./field";

/** Field on its own — the label/hint/error frame, wrapped around a bare input. */
export default (
  <div className="flex max-w-md flex-col gap-4 rounded-card border border-line bg-panel p-6">
    <Field id="f-plain" label="Title">
      <input id="f-plain" defaultValue="Refinery Block C" className={controlClass()} />
    </Field>

    <Field id="f-required" label="Slug" required hint="Lower-case, dashes only">
      <input id="f-required" required defaultValue="refinery-block-c" className={controlClass({ mono: true })} />
    </Field>

    <Field id="f-error" label="Email" error="Enter a valid address">
      <input id="f-error" defaultValue="not-an-email" className={controlClass({ invalid: true })} />
    </Field>

    <Field id="f-disabled" label="Company" disabled>
      <input id="f-disabled" disabled defaultValue="Locked" className={controlClass()} />
    </Field>

    <Field id="f-bare">
      <input id="f-bare" aria-label="No label" placeholder="no label at all" className={controlClass({ spaced: false })} />
    </Field>
  </div>
);
