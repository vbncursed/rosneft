import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { createRole, listRoles, renameRole, setRolePermissions } from "./roles-gateway";

const role = { slug: "field-operator", title: "Field Operator", isSystem: false, permissionSlugs: [] };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  // A factory, not mockResolvedValue: a real Response body can be read only
  // once, and this default answers more than one call per test.
  fetchMock = vi.fn(() => Promise.resolve(json(role)));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const request = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return { url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body as string) : undefined };
};

describe("roles gateway", () => {
  it("lists every role as a domain role", async () => {
    fetchMock.mockResolvedValueOnce(json([role]));
    const roles = await listRoles();
    expect(request()).toEqual({ url: "/api/auth/roles", method: "GET", body: undefined });
    expect(roles[0].kind).toBe("custom");
  });

  it("creates with the title and permission slugs", async () => {
    await createRole("Ops", ["territory:read"]);
    expect(request()).toEqual({
      url: "/api/auth/roles",
      method: "POST",
      body: { title: "Ops", permissionSlugs: ["territory:read"] },
    });
  });

  it("renames a role, URL-encoding a slug with a space", async () => {
    await renameRole("field operator", "Field Ops");
    expect(request()).toEqual({
      url: "/api/auth/roles/field%20operator",
      method: "PATCH",
      body: { title: "Field Ops" },
    });
  });

  it("replaces a role's permissions on its own route", async () => {
    await setRolePermissions("field-operator", ["territory:read", "territory:write"]);
    expect(request()).toEqual({
      url: "/api/auth/roles/field-operator/permissions",
      method: "PUT",
      body: { permissionSlugs: ["territory:read", "territory:write"] },
    });
  });
});
