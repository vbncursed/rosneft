import { useParams } from "@tanstack/react-router";
import { Callout } from "@/shared/ui/callout";
import { PageSkeleton } from "@/shared/ui/skeleton";
import { NotFoundView } from "@/widgets/not-found";
import { useReplaceSource } from "../model/use-replace-source";
import { ReplaceSourcePage } from "./replace-source-page";

/** Maps the container onto the props-only page. No dialogs of its own. */
export function ReplaceSourceScreen() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const s = useReplaceSource(slug);

  if (s.status === "loading") {
    return <PageSkeleton shape="form" label="Loading territory" />;
  }

  if (s.status === "missing") return <NotFoundView kind="territory" />;

  if (s.status === "unavailable") {
    return <Callout tone="bad">Territory unavailable: {s.error}</Callout>;
  }

  return <ReplaceSourcePage {...s} />;
}
