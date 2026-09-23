import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { createRole, deleteRole, listRoles, updateRole } from "./roles-gateway";

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

  it("patches the title and the permission set in one call, URL-encoding the slug", async () => {
    await updateRole("field operator", { title: "Field Ops", permissionSlugs: ["territory:read"] });
    expect(request()).toEqual({
      url: "/api/auth/roles/field%20operator",
      method: "PATCH",
      body: { title: "Field Ops", permissionSlugs: ["territory:read"] },
    });
  });

  it("sends an empty set as a set", async () => {
    await updateRole("field-operator", { title: "Field operator", permissionSlugs: [] });
    expect(request().body).toEqual({ title: "Field operator", permissionSlugs: [] });
  });

  it("sends a title-only patch without a permissionSlugs key", async () => {
    await updateRole("field-operator", { title: "Field operator" });
    expect(request().body).toEqual({ title: "Field operator" });
  });

  // A role with no grants comes back as permissionSlugs: null (a Go nil slice).
  it("reads the gateway's null permission set as empty", async () => {
    fetchMock.mockResolvedValueOnce(json({ ...role, permissionSlugs: null }));
    const saved = await updateRole("field-operator", { title: "Field operator", permissionSlugs: [] });
    expect(saved.permissionSlugs).toEqual([]);
    expect(saved.grants).toBe(0);
  });

  it("deletes a role on its own route, URL-encoding the slug", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await deleteRole("field ops");
    expect(request()).toEqual({ url: "/api/auth/roles/field%20ops", method: "DELETE" });
  });
});
