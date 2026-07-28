// Словарь журнала: что вообще бывает в колонках entity и action.
//
// Источники истины лежат в бэкенде, и их два:
//   * сущности и триггерные действия — audit-service, миграция
//     00002_ensure_triggers.sql, массив specs; само действие собирается как
//     `<entity>.<lower(TG_OP)>` в 00003_ignore_bookkeeping_columns.sql;
//   * события аутентификации — gateway, authhttp/audit.go, карта
//     authAuditActions; все они пишутся с сущностью "session".
//
// ponytail: это третья копия словаря (SQL, Go, TS), и дрейф ловится только
// глазами — новая сущность в миграции здесь сама не появится. Апгрейд, когда
// станет больно: отдавать словарь эндпоинтом. Пока это не оправдывает proto,
// новый RPC и регенерацию DTO.

// Сущности, за которыми следят триггеры Postgres.
const TRIGGER_ENTITIES = [
  "territory",
  "model",
  "placement",
  "territory_assignment",
  "panorama",
  "document",
  "user",
  "user_role",
  "role",
  "role_permission",
] as const;

// Единственная сущность, которую пишет не триггер, а гейтвей: у входа в систему
// нет строки в таблице, за которой можно было бы наблюдать.
export const SESSION_ENTITY = "session";

export const ENTITIES: readonly string[] = [...TRIGGER_ENTITIES, SESSION_ENTITY];

// TG_OP в нижнем регистре. Именно insert, а не create.
const TRIGGER_OPS = ["insert", "update", "delete"] as const;

const SESSION_ACTIONS: readonly string[] = [
  "auth.login",
  "auth.login_2fa",
  "auth.login_passkey",
  "auth.logout",
  "auth.password_change",
  "auth.2fa_enable",
  "auth.2fa_disable",
  "auth.2fa_recovery_regenerate",
  "auth.passkey_register",
  "auth.passkey_delete",
];

function triggerActions(entity: string): string[] {
  return TRIGGER_OPS.map((op) => `${entity}.${op}`);
}

// actionsFor отдаёт действия одной сущности; пустая сущность означает «все».
// Список зависит от выбранной сущности, потому что иначе он — сорок строк, из
// которых осмысленны три.
export function actionsFor(entity: string): string[] {
  if (entity === SESSION_ENTITY) return [...SESSION_ACTIONS];
  if (entity) return triggerActions(entity);
  return [...TRIGGER_ENTITIES.flatMap(triggerActions), ...SESSION_ACTIONS];
}
