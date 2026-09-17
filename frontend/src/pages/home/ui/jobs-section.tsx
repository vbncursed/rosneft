import { JobCard, type JobCardModel } from "@/entities/conversion";
import { SectionHeading } from "@/shared/ui/section-heading";

export type JobsSectionProps = { jobs: JobCardModel[]; meta: string };

/** The full-width In-progress strip; absent entirely when nothing is converting. */
export function JobsSection({ jobs, meta }: JobsSectionProps) {
  if (jobs.length === 0) return null;
  return (
    <section aria-label="In progress">
      <SectionHeading title="In progress" count={meta} className="pb-3 pt-0.5" />
      <ul role="list" className="m-0 flex list-none flex-col gap-[9px] p-0">
        {jobs.map((job) => (
          <li key={`${job.kind}/${job.slug}`}>
            <JobCard card={job} />
          </li>
        ))}
      </ul>
    </section>
  );
}
