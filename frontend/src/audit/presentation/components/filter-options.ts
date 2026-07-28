import type { DropdownOption } from "@/shared/presentation/components/dropdown/dropdown-option";
import { ENTITIES, actionsFor } from "@/audit/domain/vocabulary";

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

// Акторы подписаны email'ом, id уходит в подсказку: два похожих адреса всё ещё
// различимы, а UUID не занимает основную строку.
export function actorOptions(actors: Map<string, string>): DropdownOption[] {
  const rows = [...actors]
    .map(([id, email]) => ({ value: id, label: email, hint: id.slice(0, 8) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [ANY, ...rows];
}
