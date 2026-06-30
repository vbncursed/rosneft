# Territory visibility scoping by admin hierarchy

**Date:** 2026-06-30
**Status:** Approved design, ready for implementation planning

## Problem

Today `GET /api/territories` returns **every** territory to **every** authenticated
user. Reads are not scoped at all. We need per-admin visibility:

- **Root** (`users.is_owner = true`) sees **all** territories.
- An **admin** (Company Owner) sees **only** territories that Root explicitly
  assigned to him.
- Everyone the admin created — and their descendants down the `created_by`
  tree (owner / People & Roles Manager / etc.) — **inherits** the admin's
  assigned set.

## Current state (as found)

- Territories live in **catalog-service** (own Postgres DB). The
  `territories` table has **no** owner/`created_by`/assignment column.
  `ListTerritories` is `SELECT ... FROM territories ORDER BY slug` with no
  `WHERE` filter.
- Users + the `created_by` self-FK + the `is_owner` flag live in
  **auth-service** (separate Postgres DB). No recursive ancestor/descendant
  walk exists — only single-level `created_by = $1` scoping for users.
- **gateway-service** is the only public surface. On every `/api` request it
  validates the Bearer token against auth-service `ValidateToken` (returns
  `user_id`, `permissions`, `is_owner`) and stores them in a request
  principal. It then gates **mutations** by route permission; **reads are not
  gated**. The principal's `user_id` is currently never read.
- gateway calls catalog with **no identity** — `ListTerritoriesRequest` is
  empty. catalog has no concept of users.
- Two separate databases → a single-query JOIN of territory ↔ user hierarchy
  is impossible. Scoping must be composed across services at the gateway.

## Decisions

- **Who creates territories:** only Root. → no auto-assign-on-create needed.
- **Assignment cardinality:** many-to-many — one territory can be assigned to
  several admins (shared across companies).
- **Models:** out of scope. Models stay global (visible to all) for now.
- **Identity delivery:** compute the caller's `owning_admin_id` once at login,
  store it in the session, return it from `ValidateToken`. Zero extra gRPC
  round-trips at request time (chosen over a dedicated per-request RPC and over
  a denormalized `tenant_id` column on `users`).

### Definition of `owning_admin_id`

The topmost ancestor of a user that sits directly **under** a Root. Computed by
walking `created_by` upward:

- User is Root (`is_owner`) → no owning admin; relies on `all_access`.
- User created directly by a Root → owning admin is **self**.
- Deeper user → owning admin is the ancestor whose `created_by` points to a
  Root.

Because assignment is checked against the caller's owning admin, an admin and
his entire subtree resolve to the **same** `owning_admin_id`, which gives the
required downward inheritance.

## Architecture

### 1. catalog-service (owns territories + assignments)

- **Migration:** new table
  `territory_assignments(territory_id BIGINT REFERENCES territories(id) ON DELETE CASCADE, admin_user_id UUID, PRIMARY KEY (territory_id, admin_user_id))`
  plus an index on `admin_user_id`. `admin_user_id` is an opaque UUID from the
  auth DB — no cross-database FK (intentional).
- **Read scoping:** `ListTerritoriesRequest` gains `string scope_admin_id` and
  `bool all_access`. `all_access = true` (Root) → no filter; otherwise
  `WHERE EXISTS (SELECT 1 FROM territory_assignments a WHERE a.territory_id = t.id AND a.admin_user_id = scope_admin_id)`.
- **Single-territory reads:** `GetTerritory` and the scene-bundle path take the
  same `scope_admin_id` / `all_access`. A territory not visible to the scope
  returns `NotFound` (foreign = 404, mirroring the existing user-scoping
  behavior) so a non-root user cannot open an unassigned territory by slug.
- **Assignment management** (full-set replacement, mirroring the existing
  `SetRoles` pattern):
  - `SetTerritoryAdmins(slug, admin_ids[])` — replaces the assignment set.
  - `GetTerritoryAdmins(slug) -> admin_ids[]`.

### 2. auth-service (owns the hierarchy)

- **Storage:** `ResolveOwningAdmin(userID) -> adminID` using a `WITH RECURSIVE`
  CTE over `users(created_by)`, returning the node whose parent is a Root (or
  self if created directly by a Root; empty for a Root caller).
- **Session:** compute `owning_admin_id` at login and store it in the session
  payload alongside `is_owner`.
- **Proto:** `ValidateTokenResponse` gains `string owning_admin_id`.

### 3. gateway-service (orchestrator)

- Principal gains `owning_admin_id` (+ a `principalOwningAdminID` accessor),
  alongside the existing `is_owner` / `perms`.
- The territories service reads the principal from context and forwards
  `all_access = is_owner`, `scope_admin_id = owning_admin_id` into the catalog
  `ListTerritories` / `GetTerritory` / scene calls.
- **New Root-only endpoints:**
  - `GET /api/territories/{slug}/admins` → current assignment set.
  - `PUT /api/territories/{slug}/admins` → replace assignment set.
  - Both enforce `is_owner` explicitly in the handler (not merely a route
    permission), so only Root can assign.

### 4. frontend

- Territory list: data flow unchanged — the backend now returns the scoped set
  automatically.
- **Root-only "Assign admins" UI** on a territory: a drawer with admin
  checkboxes and a `PUT` (full replacement), reusing the existing drawer
  pattern (e.g. `EditRolesDrawer`).
- Admin candidates come from the existing `ListUsers` (Root sees all), filtered
  to the Company Owner role on the client. Note: assignment **targets** are
  Company-Owner-role users; the runtime `owning_admin_id` is resolved
  **structurally** (topmost node under a Root) and the two normally coincide
  because Root creates admins directly. A territory assigned to a user whose
  structural owning-admin differs from himself would not be self-visible — the
  UI only lists Company Owners created by Root, so this case does not arise.

## Data flow (read path)

```
GET /api/territories
  → gateway: Authenticate → principal{user_id, perms, is_owner, owning_admin_id}
  → gateway territories service: scope_admin_id = owning_admin_id, all_access = is_owner
  → catalog ListTerritories(scope_admin_id, all_access)
  → SQL: all_access ? no filter : WHERE EXISTS assignment(admin_user_id = scope_admin_id)
```

## Rollout

Existing territories have zero assignments. After deploy: **Root sees all**
(via `all_access` bypass), **admins see nothing** until Root assigns. No
backfill required. Root populates assignments through the new UI.

## Out of scope

- Per-owner scoping of Models (deferred; models stay global).
- Mid-level assignments (assigning a territory to a non-admin sub-user). The
  model checks the caller's owning admin only; assignment is Root→admin.
- Auto-assign-on-create (not needed: only Root creates territories).

## Coverage check

- Root → all territories. ✅ (`all_access`)
- Admin → only assigned. ✅ (`scope_admin_id = self`)
- Admin's subtree → inherits. ✅ (every descendant resolves to the same
  `owning_admin_id`)
