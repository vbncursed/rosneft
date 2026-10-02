export const HASH = /^[0-9a-f]{64}$/u;
const SLUG = /^[a-z0-9][a-z0-9-]{0,127}$/u;
// auth-service: users.id UUID PRIMARY KEY (migrations/00001_init.sql).
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const GIB = 1024 ** 3;

export const LIMITS: readonly number[] = [5 * GIB, 10 * GIB, 20 * GIB, 50 * GIB];
export const DEFAULT_LIMIT = 10 * GIB;

export const isHash = (v: unknown): v is string => typeof v === "string" && HASH.test(v);
export const isSlug = (v: unknown): v is string => typeof v === "string" && SLUG.test(v);
export const isUserId = (v: unknown): v is string => typeof v === "string" && USER_ID.test(v);
export const isLimit = (v: unknown): v is number => typeof v === "number" && LIMITS.includes(v);
