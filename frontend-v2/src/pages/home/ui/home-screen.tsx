import { useNavigate } from "@tanstack/react-router";
import { Callout } from "@/shared/ui/callout";
import { Skeleton } from "@/shared/ui/skeleton";
import type { ConsoleNavItem } from "@/widgets/console-nav";
import type { ConsoleKey } from "../model/console-hints";
import { showConsole } from "../model/home-view";
import { useConsoleCounters } from "../model/use-console-counters";
import { useHome } from "../model/use-home";
import { HomePage } from "./home-page";

export type HomeScreenProps = {
  /** The six console screens with the closed ones marked — the route hands them down from consoleNav. */
  consoleItems: ConsoleNavItem[];
};

/** Maps the two containers onto the page and navigates for it. */
export function HomeScreen({ consoleItems }: HomeScreenProps) {
  const s = useHome();
  const hints = useConsoleCounters(consoleItems);
  const navigate = useNavigate();

  if (s.status === "loading") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading home"
        className="flex flex-col gap-3"
      >
        <Skeleton height="28px" width="30%" />
        <Skeleton height="96px" />
        <Skeleton height="96px" />
      </div>
    );
  }
  if (s.status === "unavailable") {
    return <Callout tone="bad">Home is unavailable: {s.error}</Callout>;
  }

  return (
    <HomePage
      meta={s.meta}
      canUploadTerritory={s.canUploadTerritory}
      canUploadModel={s.canUploadModel}
      onUploadTerritory={() => void navigate({ to: "/territories/new" })}
      onUploadModel={() => void navigate({ to: "/models/new" })}
      jobs={s.jobs}
      jobsMeta={s.jobsMeta}
      territories={s.territories}
      models={
        s.models.shown ? { cards: s.models.cards, total: s.models.total, meta: s.models.meta } : null
      }
      console={
        showConsole(consoleItems)
          ? consoleItems.map((i) => ({
              label: i.label,
              href: i.href,
              // A key outside the six Home counts for gets no hint, not a crash.
              hint: hints[i.key as ConsoleKey] ?? { kind: "static", text: "" },
              locked: !!i.disabled,
            }))
          : null
      }
      activity={s.activity}
      activityLoading={s.activityLoading}
      onOpen={(href) => void navigate({ href })}
    />
  );
}
