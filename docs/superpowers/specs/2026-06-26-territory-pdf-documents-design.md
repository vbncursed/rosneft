# Territory PDF Documents — Design Spec

**Date:** 2026-06-26
**Status:** Approved design, pending implementation plan
**Target Go version:** 1.26.x (use modern Go: `errors.AsType[T]`, `any`, `slices`/`maps`, `t.Context()` in tests)

## Goal

Allow attaching multiple PDF documents to a territory. Documents are uploaded
(reusing the existing chunked-upload pipeline), listed in the viewer's overlays
panel next to panoramas, and opened in an in-app overlay (browser PDF viewer via
`<iframe>`) over the 3D scene. PDFs are **not** anchored to a point in the scene
and are **not** converted — they are stored as-is in the blob store and served
through the existing `/api/assets/{hash}` route.

## Non-goals / deliberate simplifications (ponytail)

- **No slug** on a document — it is identified by `id`, content served by blob hash.
- **No update/rename** — title is set at upload time. Add later if needed.
- **Delete removes only the DB row**, not the blob (blobs are content-addressed
  and shared, same as panoramas; GC is a separate concern).
- **Server-side PDF validation is gated on the declared `contentType`** so the
  shared upload/finalize path does not break existing ZIP/image uploads.
- **No frontend tests** (no test infra in `frontend/`); verify via build + manual.
  Backend gets minimal tests on new non-trivial logic.

## What we must NOT break

- Existing territory / model / panorama / placement tables and endpoints — untouched.
- Shared upload `finalize` — changed **additively**: the new magic-byte check runs
  **only when `session.ContentType == "application/pdf"`**. ZIP and JPG/PNG uploads
  are unaffected.
- All migrations are additive (`CREATE TABLE` / `INSERT` only). Prod catches up on
  boot via goose auto-migrate.
- mesh-worker, asset-service, redis, conversion flow — not touched.

## Permissions

New permissions `document:read` / `document:write` / `document:delete`, mirroring
the existing `panorama:*` / `territory:*` scheme.

**Critical:** `admin`'s permissions were seeded by a one-time snapshot in auth
migration `00002`, so a permission added in a later migration is **not**
auto-granted to admin. The new migration must grant the document perms to
`admin` and `editor` explicitly (write/delete), and `read` to `owner` and
`viewer`. Permissions flow to the frontend automatically via `/api/auth/me`
(`can("document:write")`), no auth-code/proto changes needed.

## Architecture

### Backend — catalog-service (entity storage)

- **Migration** `internal/migrate/migrations/00010_territory_documents.sql`:
  ```sql
  CREATE TABLE territory_documents (
      id               BIGSERIAL PRIMARY KEY,
      territory_id     BIGINT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
      title            TEXT NOT NULL,
      source_blob_hash TEXT NOT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX idx_territory_documents_territory ON territory_documents(territory_id);
  ```
- **Domain** `internal/domain/document.go`: `Document{ID, TerritorySlug, Title, SourceBlobHash, CreatedAt}`; `ErrDocumentNotFound` in `errors.go`.
- **Storage** (pgx, one file per method): `create_document.go` (CTE: territory slug → id → INSERT → JOIN back for territory_slug), `list_documents.go` (by territory slug, ordered by `created_at`), `delete_document.go` (plain `DELETE WHERE id`). Add `documentSelectCols` / `scanDocument` to `queries.go`.
- **Service** (one file per method): `create_document.go` (validate title + sourceBlobHash required), `list_documents.go`, `delete_document.go`. Add 3 methods to the `Repository` interface in `service/catalog.go`.
- **Transport gRPC**: `create_document.go`, `list_documents.go`, `delete_document.go`; `documentToProto` in `converters.go`; add `ErrDocumentNotFound` to the `codes.NotFound` mapping in `server.go`.
- **Proto** `backend/proto/rosneft/catalog/v1/catalog.proto`: `Document` message, `ListDocuments` / `CreateDocument` / `DeleteDocument` RPCs + Request/Response wrappers. Regenerate.
- **Bootstrap**: no change (new methods picked up through existing interfaces).

### Backend — gateway-service (REST + permissions)

- **OpenAPI** `api/openapi.yaml`:
  - Schemas `Document` (id, territorySlug, title, sourceBlobHash, createdAt) and `DocumentCreate` (title, sourceBlobHash).
  - Paths `GET`/`POST /api/territories/{slug}/documents`, `DELETE /api/territories/{slug}/documents/{id}`.
  - Add `documents: [Document]` to `SceneBundle`.
- **Route permissions** `internal/transport/authhttp/route_permissions.go`:
  ```go
  "POST /api/territories/{slug}/documents":        "document:write",
  "DELETE /api/territories/{slug}/documents/{id}": "document:delete",
  ```
- **Domain/Service/Transport**: `internal/domain/document.go` + `Documents` field on `SceneBundle`; `internal/service/documents.go` (validate + proxy to catalog gRPC); `scene_bundle.go` adds a `gr.Go()` for `ListDocuments` + `bundle.Documents = nilToEmpty...`; `internal/transport/httpapi/documents.go` (List/Create/Delete handlers) + `documentToAPI` in `converters.go` + 3 methods on the `Service` interface.
- **Regeneration:** `make openapi-gen` (regenerates `openapi_gen.go` AND the embedded spec served by Scalar UI at `/openapi.json`). This is the "update swagger" step — the new document endpoints appear in the API docs automatically.

### Backend — auth-service (new permissions)

- **Migration** `internal/migrate/migrations/00006_document_permissions.sql`:
  ```sql
  -- +goose Up
  INSERT INTO permissions (slug, description) VALUES
    ('document:read','read documents'),
    ('document:write','create/update documents'),
    ('document:delete','delete documents');

  INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id FROM roles r JOIN permissions p
    ON p.slug IN ('document:read','document:write','document:delete')
  WHERE r.slug IN ('admin','editor');

  INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id FROM roles r JOIN permissions p
    ON p.slug = 'document:read'
  WHERE r.slug IN ('owner','viewer');

  -- +goose Down
  DELETE FROM role_permissions WHERE permission_id IN
    (SELECT id FROM permissions WHERE slug LIKE 'document:%');
  DELETE FROM permissions WHERE slug LIKE 'document:%';
  ```

### Backend — upload-service (server-side PDF validation)

- **Helper** `backend/pkg/fileheader/fileheader.go`:
  ```go
  func IsPDF(header []byte) bool {
      return len(header) >= 5 && bytes.Equal(header[:5], []byte("%PDF-"))
  }
  ```
  + `fileheader_test.go` (assert-based, `t.Context()` not needed here).
- **Finalize** (`upload-service/internal/storage/finalize.go` or `service/finalize.go`):
  when `session.ContentType == "application/pdf"`, read the first 5 bytes and
  return `domain.ErrInvalidInput` (→ HTTP 400) if they are not `%PDF-`. All other
  content types behave exactly as before. This is the "don't break existing" guard.

### Frontend — new `document/` bounded context (lean)

```
document/
  domain/document.ts                  # {id, territorySlug, title, sourceBlobHash, createdAt}
  domain/pdf-signature.ts             # isPdfSignature(bytes) — mirrors image-signature.ts
  infrastructure/document-gateway.ts  # list / create / delete + mapDocument(DTO→domain)
  application/use-documents.ts        # list + optimistic add/remove (mirrors use-panoramas)
  presentation/components/
    documents-section.tsx             # panel section: list + "+ Document" (gated by can("document:write"))
    document-upload-form.tsx          # useChunkedUpload(contentType:"application/pdf") + %PDF check + createDocument
    document-row.tsx                  # row: title · "Open" · delete (gated by can("document:delete"))
    document-overlay.tsx              # fullscreen <iframe src={assetUrl(hash)}> + close + download
```

**Integration:**

- `territory/domain/scene-bundle.ts` + `territory/infrastructure/territory-gateway.ts` — add `documents` to the bundle and its mapping.
- `viewer/.../model-viewer.tsx` — render `<DocumentsSection>` in the overlays panel and lift `openDocumentId` state; when set, render `<DocumentOverlay>` over the scene.
- DTO regen: `openapi-typescript ... -o src/shared/infrastructure/api/dto.ts`.

**UX:** Documents section in the overlays panel (next to panoramas), a list of rows.
Clicking a row opens an overlay over the scene with the browser's built-in PDF
viewer (`<iframe>`), plus close (✕) and Download. Upload/delete live in the same
section, gated by permissions. Upload is in the viewer panel (like panoramas),
not on the territory-create form.

## Build, verify, deploy

1. Regenerate: catalog proto (`buf generate` / `make proto-gen`) → gateway
   (`make openapi-gen`) → frontend DTO (`openapi-typescript`).
2. Backend: `go build ./...` + `go test ./...` (catalog document service tests + `pkg/fileheader`).
3. Frontend: `yarn lint && yarn build`.
4. Deploy: `git pull` on prod → `docker compose -p andrey up -d --build catalog gateway auth upload frontend`.
   Catalog (`00010`) and auth (`00006`) migrations apply on boot automatically.

## Testing

- `pkg/fileheader`: table-driven test for `IsPDF` (valid header, short input, wrong magic).
- catalog-service document service: testify/suite + minimock repo mock, covering
  create (validation), list, delete (not-found path). Use `minimock.AnyContext`.
- Manual: upload a PDF in the viewer panel, confirm it lists, opens in overlay,
  downloads, deletes; confirm a non-PDF (renamed `.pdf`) is rejected at finalize;
  confirm a `viewer`-role user can open but not upload/delete.
