import { clsx as cx } from "clsx";

export type ArtifactRowProps = {
  tag: string;
  file: string;
  meta: string;
  size: string;
  /** When given the row is a download link; the `download` attribute is the file name. */
  href?: string;
  className?: string;
};

const ROW =
  "flex items-center gap-[11px] rounded-[9px] border bg-panel-2 px-3 py-2.5 text-fg no-underline";

/** One converted LOD as the gallery's "Artifact row" draws it — a tag, the file, a meta line and its size. */
export function ArtifactRow({ tag, file, meta, size, href, className }: ArtifactRowProps) {
  const body = (
    <>
      <span className="shrink-0 rounded-[5px] border border-line-2 px-[7px] py-0.5 font-mono text-[9px] tracking-[0.1em] text-muted">
        {tag}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[11px]">{file}</span>
        <span className="mt-[3px] block font-mono text-[10px] text-muted">{meta}</span>
      </span>
      <span className="whitespace-nowrap font-mono text-[10px] text-muted">{size}</span>
    </>
  );
  // One property, one branch: the hover border is a ternary against the base
  // border rather than a second utility beside it (clsx does not merge).
  if (href) {
    return (
      <a
        href={href}
        download={file}
        className={cx(
          ROW,
          "border-line hover:border-line-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          className,
        )}
      >
        {body}
      </a>
    );
  }
  return <div className={cx(ROW, "border-line", className)}>{body}</div>;
}
