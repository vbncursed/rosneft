package bootstrap

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/httpapi"
)

// mountRootRoutes registers the routes that live on the root router, outside
// the /api JSON chain (see InitRouter for the whole stack): the docs, the
// binary and streaming routes, the owner-only proxies, the CSV export and
// /api/auth/*.
func mountRootRoutes(
	r chi.Router,
	apiServer *httpapi.Server,
	authH *authhttp.Handlers,
	assetProxy, metricsHandler, summaryHandler http.Handler,
) {
	r.Get("/docs", apiServer.ServeDocs)
	r.Get("/openapi.json", apiServer.ServeSpec)

	// Binary asset proxy + SSE — outside the JSON middleware chain, but neither
	// outside authentication nor, for assets, outside the tenant.
	//
	// The asset route cannot use RequireTerritoryAccess: a blob hash addresses
	// content and is deduplicated across territories and models, so it has no
	// single territory to check against. RequireBlobAccess asks the catalog the
	// answerable version of the question instead — is there any row holding this
	// hash that this caller can see — which also lets a model's bytes through to
	// everyone, the library being shared by decision.
	r.With(authH.Authenticate, apiServer.RequireBlobAccess).Get("/api/assets/{hash}", assetProxy.ServeHTTP)
	r.With(authH.Authenticate, apiServer.RequireBlobAccess).Head("/api/assets/{hash}", assetProxy.ServeHTTP)
	// SSE and the jobs list — outside the JSON middleware chain (the stream
	// cannot be buffered, the list must not be cached), but inside the tenant:
	// both apply the territory rule through Server.scopedJob / visibleJob, and
	// a territory the caller cannot see reads as "job not found".
	r.With(authH.Authenticate).Get("/api/jobs/{id}/events", apiServer.WatchJobEvents)
	r.With(authH.Authenticate).Get("/api/jobs", apiServer.ListJobs)

	// Owner-only Prometheus proxy. Authenticated (for the owner check) but
	// outside the openapi strict handlers — it resolves a panel ID to
	// server-side PromQL and proxies Prometheus, like the asset proxy for GLBs.
	r.With(authH.Authenticate).Get("/api/metrics/query", metricsHandler.ServeHTTP)

	// Home's console cards as numbers. Root router like /api/jobs: the answer is
	// no-store, so the ETag chain would only hash it. Each card is gated and
	// scoped inside the handler; see transport/summary.
	r.With(authH.Authenticate).Get("/api/console/summary", summaryHandler.ServeHTTP)

	// Audit CSV export. On the root router because ETagMiddleware hashes the
	// whole response body — i.e. buffers it — which defeats a streaming export.
	// Its gate is applied by hand: RequirePermissionForRoute only covers the
	// /api JSON sub-router below.
	r.With(authH.Authenticate, authH.Require("audit:read")).
		Get("/api/audit.csv", apiServer.ServeAuditCSV)

	// /api/auth/* on the root router: login/2fa are public; self/admin
	// handlers validate the Bearer token themselves via the auth client.
	authH.Mount(r)
}
