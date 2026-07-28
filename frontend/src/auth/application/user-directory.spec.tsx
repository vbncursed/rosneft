// Run with: yarn test:spa  (vitest + jsdom).
import { describe, it, expect, vi } from "vitest";

// useQuery мокается, а не поднимается QueryClientProvider: под проверкой то, что
// хук делает с ответом, а не сам react-query.
let listed: Array<{ id: string; username: string }> = [];
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: listed }),
}));
vi.mock("@/auth/infrastructure/auth-admin-gateway", () => ({
  listUsers: () => Promise.resolve([]),
}));

const { renderHook } = await import("@/test-support/render-hook");
const { useUserDirectory } = await import("./user-directory");

const self = { id: "self-id", username: "vbncursed1" };

describe("useUserDirectory", () => {
  it("always knows the signed-in user", () => {
    // /api/auth/users фильтрует по created_by, а created_by = self не бывает ни
    // у кого — поэтому себя в ответе нет никогда. Без подстановки собственные
    // действия в журнале подписаны сырым UUID, что и увидел первый не-Root.
    listed = [{ id: "made-by-me", username: "test1" }];

    const { result } = renderHook(() => useUserDirectory(self));

    expect(result.current.get("self-id")).toBe("vbncursed1");
    expect(result.current.get("made-by-me")).toBe("test1");
  });

  it("survives an empty or refused list", () => {
    // Кастомная роль с audit:read без users:read получает 403; журнал обязан
    // остаться читаемым, а своё имя — на месте.
    listed = [];

    const { result } = renderHook(() => useUserDirectory(self));

    expect(result.current.get("self-id")).toBe("vbncursed1");
    expect(result.current.size).toBe(1);
  });

  it("works without a signed-in user", () => {
    listed = [{ id: "a", username: "aaa" }];

    const { result } = renderHook(() => useUserDirectory(null));

    expect(result.current.get("a")).toBe("aaa");
    expect(result.current.size).toBe(1);
  });

  it("does not let the list overwrite the signed-in name", () => {
    // Root видит всех, включая себя. Подстановка не должна ничего портить.
    listed = [{ id: "self-id", username: "vbncursed1" }];

    const { result } = renderHook(() => useUserDirectory(self));

    expect(result.current.size).toBe(1);
    expect(result.current.get("self-id")).toBe("vbncursed1");
  });
});
