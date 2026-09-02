import type { ReactNode } from "react";
import type { User } from "@/entities/user";
import { FilterBar } from "@/features/audit-filter";
import { Button } from "@/shared/ui/button";
import { CoverageMeter, type CoverageSegment } from "@/shared/ui/coverage-meter";
import { StatTile, type StatTileTone } from "@/entities/metric";
import { ConsoleSidebar } from "@/widgets/console-sidebar";
import type { ConsoleNavItem } from "@/widgets/console-nav";
import { PageHeader } from "@/widgets/page-header";
import { PeopleGroups, type PeopleGroup } from "@/widgets/people-groups";
import { PersonInspector, type PersonDetail } from "@/widgets/person-inspector";

export type UsersPageStat = {
  label: string;
  value: string;
  hint: string;
  tone?: StatTileTone;
};

/** Everything the inspector shows for the person currently open. */
export type InspectedPerson = {
  user: User;
  details: PersonDetail[];
  /** Roles editor and territory list — composed by the route. */
  body: ReactNode;
};

export type UsersPageProps = {
  nav: ConsoleNavItem[];
  backHref: string;
  viewer: { username: string; roleTitle: string };

  groups: PeopleGroup[];
  coverage: { label: string; detail: string; segments: CoverageSegment[] };
  stats: UsersPageStat[];

  query: string;
  onQueryChange: (query: string) => void;

  selectedId: string | null;
  onSelect: (id: string) => void;
  onCloseInspector: () => void;
  /** Absent while the selected person's detail is still loading. */
  inspected?: InspectedPerson | null;

  onCreateUser: () => void;
  onResetPassword: () => void;
  onRequire2fa: () => void;
  onFreeze: () => void;
  onDelete: () => void;
  canManage?: boolean;
};

const FILTER_PLACEHOLDER = "filter: role:field-operator 2fa:off status:active";

export function UsersPage({
  nav,
  backHref,
  viewer,
  groups,
  coverage,
  stats,
  query,
  onQueryChange,
  selectedId,
  onSelect,
  onCloseInspector,
  inspected,
  onCreateUser,
  onResetPassword,
  onRequire2fa,
  onFreeze,
  onDelete,
  canManage = true,
}: UsersPageProps) {
  return (
    <div className="grid min-h-dvh grid-cols-[236px_minmax(0,1fr)] bg-bg text-fg">
      <ConsoleSidebar items={nav} active="users" backHref={backHref} viewer={viewer} />

      <main className="flex min-w-0 flex-col gap-5 px-9 pb-16 pt-8">
        <PageHeader
          size="lg"
          eyebrow="People · access posture"
          title="Users"
          action={
            canManage ? (
              <Button variant="primary" onClick={onCreateUser}>
                + New user
              </Button>
            ) : undefined
          }
        />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
          <CoverageMeter
            label={coverage.label}
            detail={coverage.detail}
            segments={coverage.segments}
            className="rounded-[11px] border border-line bg-panel px-4.5 py-4"
          />
          {stats.map((stat) => (
            <StatTile
              key={stat.label}
              size="lg"
              label={stat.label}
              state={{ kind: "value", value: stat.value }}
              hint={stat.hint}
              tone={stat.tone ?? "fg"}
            />
          ))}
        </div>

        <FilterBar
          query={query}
          onChange={onQueryChange}
          label="Filter people"
          placeholder={FILTER_PLACEHOLDER}
        />

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(420px,1fr)_minmax(300px,360px)]">
          <PeopleGroups groups={groups} selectedId={selectedId} onSelect={onSelect} />

          {inspected ? (
            // Sticky so the inspector stays put while a long list scrolls past.
            <div className="xl:sticky xl:top-6">
              <PersonInspector
                user={inspected.user}
                details={inspected.details}
                canManage={canManage}
                onClose={onCloseInspector}
                onResetPassword={onResetPassword}
                onRequire2fa={onRequire2fa}
                onFreeze={onFreeze}
                onDelete={onDelete}
              >
                {inspected.body}
              </PersonInspector>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
