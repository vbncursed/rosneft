import { useQuery } from "@tanstack/react-query";
import { fetchAuditActors } from "@/audit/infrastructure/audit-gateway";
import type { AuditActor } from "@/audit/infrastructure/audit-gateway";

// Кандидаты для фильтра по актору. Список приходит с сервера уже разрешённым и
// отсортированным: только он знает область журнала, а доступный клиенту список
// пользователей с ней не совпадает — на этом несовпадении собственные действия
// пользователя раньше отображались сырым UUID.
//
// Ошибка проглатывается: пустой дропдаун оставляет журнал читаемым, а строки
// подписаны независимо от этого запроса.
export function useAuditActors(): AuditActor[] {
  const { data } = useQuery({
    queryKey: ["audit-actors"],
    queryFn: fetchAuditActors,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  return data ?? [];
}
