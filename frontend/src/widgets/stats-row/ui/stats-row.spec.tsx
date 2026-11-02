import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatsRow } from "./stats-row";

const meter = {
  label: "Pipeline",
  detail: "3 / 5",
  segments: [
    { label: "Ready", value: 3, tone: "ok" as const },
    { label: "Failed", value: 2, tone: "bad" as const },
  ],
};
const stats = [
  { label: "Territories", value: "4", hint: "2 ready" },
  { label: "Failed", value: "1", hint: "check logs", tone: "bad" as const },
];

describe("StatsRow", () => {
  it("draws the same markup the pages drew inline", () => {
    const { container } = render(<StatsRow meter={meter} detailTone="accent" stats={stats} />);
    expect(container.innerHTML).toMatchInlineSnapshot(
      `"<div class="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]"><div class="rounded-[11px] border border-line bg-panel px-4.5 py-4"><div class="flex items-baseline justify-between gap-3"><span class="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">Pipeline</span><span class="font-mono text-[11px] text-accent">3 / 5</span></div><div role="img" aria-label="Pipeline: Ready 60%, Failed 40%" class="mt-3 flex h-2 overflow-hidden rounded-full border border-line"><span style="flex-grow: 3;" class="bg-ok"></span><span style="flex-grow: 2;" class="bg-bad"></span></div><div class="mt-3 flex flex-wrap gap-3.5"><span class="flex items-center gap-[7px] font-mono text-[10px] text-muted"><span aria-hidden="true" class="size-[7px] rounded-[2px] bg-ok"></span>Ready · 3</span><span class="flex items-center gap-[7px] font-mono text-[10px] text-muted"><span aria-hidden="true" class="size-[7px] rounded-[2px] bg-bad"></span>Failed · 2</span></div></div><div class="rounded-[11px] border border-line bg-panel px-4.5 py-4"><div class="flex items-center justify-between gap-2.5"><p class="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">Territories</p></div><p class="m-0 font-mono mt-2.5 text-[26px] leading-none text-fg"><span aria-hidden="true">4</span><span class="sr-only">Territories: 4</span></p><p class="m-0 mt-1.5 text-[11px] text-dim">2 ready</p></div><div class="rounded-[11px] border border-line bg-panel px-4.5 py-4"><div class="flex items-center justify-between gap-2.5"><p class="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">Failed</p></div><p class="m-0 font-mono mt-2.5 text-[26px] leading-none text-bad"><span aria-hidden="true">1</span><span class="sr-only">Failed: 1</span></p><p class="m-0 mt-1.5 text-[11px] text-dim">check logs</p></div></div>"`,
    );
  });
  it("leaves the readout tone to the first segment when none is given", () => {
    const { container } = render(<StatsRow meter={meter} stats={[]} />);
    expect(container.firstElementChild?.firstElementChild?.outerHTML).toMatchInlineSnapshot(
      `"<div class="rounded-[11px] border border-line bg-panel px-4.5 py-4"><div class="flex items-baseline justify-between gap-3"><span class="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">Pipeline</span><span class="font-mono text-[11px] text-ok">3 / 5</span></div><div role="img" aria-label="Pipeline: Ready 60%, Failed 40%" class="mt-3 flex h-2 overflow-hidden rounded-full border border-line"><span style="flex-grow: 3;" class="bg-ok"></span><span style="flex-grow: 2;" class="bg-bad"></span></div><div class="mt-3 flex flex-wrap gap-3.5"><span class="flex items-center gap-[7px] font-mono text-[10px] text-muted"><span aria-hidden="true" class="size-[7px] rounded-[2px] bg-ok"></span>Ready · 3</span><span class="flex items-center gap-[7px] font-mono text-[10px] text-muted"><span aria-hidden="true" class="size-[7px] rounded-[2px] bg-bad"></span>Failed · 2</span></div></div>"`,
    );
  });
});
