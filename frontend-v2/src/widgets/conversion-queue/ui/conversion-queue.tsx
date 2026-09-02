import { jobProgress, type ConversionJob } from "@/entities/conversion";
import { Badge } from "@/shared/ui/badge";
import { Card } from "@/shared/ui/card";
import { ProgressBar } from "@/shared/ui/progress-bar";

export type ConversionQueueProps = {
  jobs: ConversionJob[];
  title?: string;
};

const STATE_TONE = { queued: "neutral", running: "warn", failed: "bad" } as const;

export function ConversionQueue({ jobs, title = "Conversion queue" }: ConversionQueueProps) {
  return (
    <Card overline={title} padded={false} className="overflow-hidden">
      {jobs.length === 0 ? (
        <p className="m-0 px-5 py-4 text-[13px] text-muted">
          Nothing is converting. Uploads appear here while they are processed.
        </p>
      ) : (
        <ul aria-label={title} className="m-0 list-none p-0">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="grid grid-cols-[180px_minmax(0,1fr)_130px_90px] items-center gap-3.5 border-t border-line px-5 py-3.5"
            >
              <span className="truncate font-mono text-xs text-fg">{job.slug}</span>

              <div>
                <ProgressBar
                  variant="thin"
                  value={jobProgress(job)}
                  tone={job.state === "failed" ? "bad" : "accent"}
                  ariaLabel={`${job.slug} conversion`}
                />
                <p className="m-0 mt-1.5 text-[11px] text-muted">{job.stage}</p>
              </div>

              <Badge size="sm" tone={STATE_TONE[job.state]} fill="soft">
                {job.state}
              </Badge>

              <span className="text-right font-mono text-[11px] text-muted">{job.eta}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
