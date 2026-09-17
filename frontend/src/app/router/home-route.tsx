import { useQuery } from "@tanstack/react-query";
import { meQuery } from "@/entities/user";
import { HomeScreen } from "@/pages/home";
import { consoleNav } from "./guard";

/**
 * `/` — the principal is already in the cache (catalogRoute's loader awaited
 * it), so the null branch is a stale-cache edge, not a loading state. The
 * console items come from the same table the sidebar reads.
 */
export function HomeRoute() {
  const { data: me } = useQuery(meQuery);
  if (!me) return null;
  return <HomeScreen consoleItems={consoleNav(me)} />;
}
