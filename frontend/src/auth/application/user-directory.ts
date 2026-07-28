import { useQuery } from "@tanstack/react-query";
import { listUsers } from "@/auth/infrastructure/auth-admin-gateway";

// Каталог «id пользователя → email» для мест, где иначе виден сырой UUID.
//
// Живёт в auth/, а не у потребителя: пользователи — предметная область этого
// контекста, и через границу уезжает Map примитивов, а не AdminUser. Доменные
// типы между контекстами не ходят.
//
// includeDeleted: журнал append-only и помнит акторов, которых уже удалили. Без
// этого их записи навсегда остались бы подписаны UUID'ом.
//
// Ошибка проглатывается намеренно и без ретраев. Сегодня каждый, у кого есть
// audit:read, имеет и users:read (роль admin получает все права), но кастомная
// роль может иметь первое без второго — тогда прилетит 403. Журнал при этом
// обязан остаться читаемым: пустая карта означает «показывай UUID», а не
// «покажи ошибку вместо страницы».
export function useUserDirectory(): Map<string, string> {
  const { data } = useQuery({
    queryKey: ["user-directory"],
    queryFn: () => listUsers("", true),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  return new Map((data ?? []).map((u) => [u.id, u.email]));
}
