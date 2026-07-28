import { useQuery } from "@tanstack/react-query";
import { listUsers } from "@/auth/infrastructure/auth-admin-gateway";

// Каталог «id пользователя → логин» для мест, где иначе виден сырой UUID.
//
// Логин, а не email: он короче, это то имя, под которым человека знают в
// системе, и уникален он ровно так же (users_username_key UNIQUE), так что
// различимость от подстановки не страдает.
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
// `self` — подписавшийся пользователь, если он известен. Принимается параметром,
// а не читается из контекста: контекст живёт в presentation, а application в его
// сторону не смотрит.
export function useUserDirectory(
  self?: { id: string; username: string } | null,
): Map<string, string> {
  const { data } = useQuery({
    queryKey: ["user-directory"],
    queryFn: () => listUsers("", true),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const directory = new Map((data ?? []).map((u) => [u.id, u.username]));
  // Себя в ответе нет и быть не может: список фильтруется по created_by, а
  // created_by = self не бывает ни у кого. Без этой строки собственные действия
  // в журнале подписаны сырым UUID — и первым это увидел первый же не-Root.
  if (self) directory.set(self.id, self.username);
  return directory;
}
