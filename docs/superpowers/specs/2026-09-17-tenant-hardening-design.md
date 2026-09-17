# Tenant hardening after the IDOR fix

Date: 2026-09-17. Follows `c5ec5e1d` (id-addressed territory mutations
scoped by slug). The security review of that change
(`.superpowers/sdd/2026-09-17-measurements-and-system-roles/review-S.md`)
raised four questions outside its scope; the user decided on 2026-09-17 to
close all of them in one task, after persisted measurements.

## H-1 A blob hash in a request body must be the caller's

`POST /api/territories`, `POST /api/territories/{slug}/source`,
`POST /api/models`, `POST /api/territories/{slug}/panoramas` and
`POST /api/territories/{slug}/documents` take a `sourceBlobHash` (and the
model PATCH a thumbnail hash) and check nothing about it. A caller who ever
learned a hash — a former guest whose access was revoked — can attach that
blob to a row of their own and read it through `RequireBlobAccess` from then
on; attached to a model, it becomes readable by every tenant.

Rule: a hash in a body is accepted only if the caller finalized an upload
with that hash (upload-service records the finalizing user) or already
passes `ResolveBlobAccess` for it. Anything else answers the same 400 an
unknown hash answers. Root is not exempt from the upload check's shape but
passes `ResolveBlobAccess` for everything.

## H-2 An upload session belongs to its author

`/api/uploads/{id}` (HEAD, PATCH, finalize, DELETE) is protected only by
the 128-bit random id. upload-service stores the creating user on the
session; every later call checks it and answers 404 to anyone else.
`DELETE /api/uploads/{id}` moves out of the guard test's "known gap"
exceptions into `routePerms` (`upload:create`).

## H-3 The model library is Root's to change

Company Owners read the library and place its models; they do not change
it. Today `admin` holds `model:delete` (it no longer holds `model:write`),
so a Company Owner can delete a model every tenant uses (a model still
placed is refused by the foreign key, an unused one is not). An auth-service
migration revokes `model:delete` from `admin`; no system role then holds
`model:write` or `model:delete`, and Root keeps both through the owner
bypass. The frontend already gates model delete on `model:delete`; its
upload and replace gates are checked the same way as the territory ones
were in `cb433ed`.

## H-4 Dead panorama ids in old allowlists

Before `c5ec5e1d` a placement could be created with another territory's
panorama ids. A one-off catalog migration removes from every
`visible_panorama_ids` the ids that are not panoramas of the placement's own
territory. It is idempotent and needs no Down beyond a no-op.

## Tests and verification

Unit and integration tests per rule; the route-permission guard test
updated; `make -C backend check`; a rebuild of the touched services and a
live matrix: `cotest` attaching a hash it never uploaded (400), another
user's upload id (404), a Company Owner deleting a model (403), Root
deleting a throwaway model (204).

## H-5 A request body has a size limit

Found while building measurements: the gateway reads any JSON body whole
before a handler sees it — there is no `http.MaxBytesReader` anywhere. One
middleware on the JSON routes caps the body (a limit generous for the
largest legitimate body, a 1 000-point measurement or a role's permission
set) and answers 413 beyond it; the upload PATCH route, which carries raw
chunks, keeps its own limit.
