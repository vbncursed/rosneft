import { useEffect, useRef } from "react";
import { Icon } from "@/shared/ui/icon";
import { parseFilters, removeToken } from "../model/query";

export type ExtraFilter = {
  label: string;
  onRemove: () => void;
};

export type FilterBarProps = {
  query: string;
  onChange: (query: string) => void;
  placeholder?: string;
  /** Names the field for assistive tech. */
  label?: string;
  /**
   * Chips that are not part of the query text — a date range preset, say.
   * They read the same but are owned by the page, not the parser.
   */
  extra?: ExtraFilter[];
};

const DEFAULT_PLACEHOLDER = "filter: entity:territory actor:a.ivanova failed:true";

export function FilterBar({
  query,
  onChange,
  placeholder = DEFAULT_PLACEHOLDER,
  label = "Filter events",
  extra = [],
}: FilterBarProps) {
  const input = useRef<HTMLInputElement>(null);
  const chips = parseFilters(query);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex items-center gap-2.5 rounded-card border border-line-2 bg-panel-2 px-3.5 py-2.5 focus-within:border-accent">
      <Icon name="search" size={16} className="shrink-0 text-accent" />

      <input
        ref={input}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="min-w-0 flex-1 border-none bg-transparent font-mono text-[13px] text-fg outline-none placeholder:text-dim"
      />

      {chips.map((chip) => (
        <span
          key={chip.token}
          className="flex shrink-0 items-center gap-[7px] rounded-full border border-accent bg-accent-soft px-[11px] py-1 font-mono text-[10px] text-accent"
        >
          {chip.token}
          <button
            type="button"
            onClick={() => onChange(removeToken(query, chip.token))}
            aria-label={`Remove filter ${chip.token}`}
            className="cursor-pointer border-none bg-transparent p-0 leading-none text-accent hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            ×
          </button>
        </span>
      ))}

      {extra.map((filter) => (
        <span
          key={filter.label}
          className="flex shrink-0 items-center gap-[7px] rounded-full border border-accent bg-accent-soft px-[11px] py-1 font-mono text-[10px] text-accent"
        >
          {filter.label}
          <button
            type="button"
            onClick={filter.onRemove}
            aria-label={`Remove filter ${filter.label}`}
            className="cursor-pointer border-none bg-transparent p-0 leading-none text-accent hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            ×
          </button>
        </span>
      ))}

      <kbd
        aria-hidden="true"
        className="shrink-0 rounded-[5px] border border-line-2 px-[7px] py-0.5 font-mono text-[10px] text-dim"
      >
        ⌘K
      </kbd>
    </div>
  );
}
