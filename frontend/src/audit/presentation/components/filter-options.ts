import type { DropdownOption } from "@/shared/presentation/components/dropdown/dropdown-option";
import { ENTITIES, actionsFor } from "@/audit/domain/vocabulary";
import type { AuditActor } from "@/audit/infrastructure/audit-gateway";

// "any" — настоящая опция, а не только placeholder: сняв фильтр, пользователь
// должен вернуться к полному журналу, а до этого выбора надо доехать мышью или
// стрелками.
const ANY: DropdownOption = { value: "", label: "any" };

export function entityOptions(): DropdownOption[] {
  return [ANY, ...ENTITIES.map((e) => ({ value: e, label: e }))];
}

export function actionOptions(entity: string): DropdownOption[] {
  return [ANY, ...actionsFor(entity).map((a) => ({ value: a, label: a }))];
}

// Акторы подписаны логином, уже разрешённым и отсортированным сервером. UUID
// здесь не показываем — он ничего не говорит человеку. Значением опции id
// остаётся: он и уходит в запрос. Актор без логина (пользователя удалили)
// подписывается укороченным id, иначе строка была бы пустой и невыбираемой.
export function actorOptions(actors: AuditActor[]): DropdownOption[] {
  return [ANY, ...actors.map((a) => ({ value: a.id, label: a.login || a.id.slice(0, 8) }))];
}
