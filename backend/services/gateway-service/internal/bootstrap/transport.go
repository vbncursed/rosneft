package bootstrap

import (
	"io"
	"log/slog"
	"net/http"

	"github.com/andybalholm/brotli"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	slogchi "github.com/samber/slog-chi"

	"github.com/vbncursed/rosneft/backend/pkg/healthz"
	"github.com/vbncursed/rosneft/backend/pkg/metrics"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/httpapi"
)

// Compile-time assertions: gateway service satisfies the transport contract,
// and the openapi-generated handler satisfies oapi-codegen's strict interface.
var (
	_ httpapi.Service               = (*service.Gateway)(nil)
	_ httpapi.StrictServerInterface = (*httpapi.Server)(nil)
)

// InitRouter builds the chi.Router stack:
//
//	[CORS, RequestID, Recoverer, slog-chi]             ← root
//	  /healthz, /readyz, /docs, /openapi.json
//	  /api/assets/{hash}                                ← binary proxy
//	  /api/jobs/{id}/events                             ← SSE
//	  /api/* sub-router
//	    [ETag, Compress(br/gzip/deflate)]
//	    openapi strict handlers
//
// Asset proxy and SSE sit on the root router so they bypass the JSON
// middleware chain — GLB binaries already carry asset-service ETag and
// would only waste CPU if compressed; SSE must not be buffered.
func InitRouter(
	svc *service.Gateway,
	assetProxy http.Handler,
	metricsHandler http.Handler,
	authH *authhttp.Handlers,
	logger *slog.Logger,
	cfg config.Config,
) (chi.Router, *healthz.Handler) {
	r := newRouterWithCORS(cfg.AllowedOrigins)

	// Record HTTP RED for every request (method + status). Outermost so it
	// times the full chain. The /metrics endpoint itself is served only on the
	// internal :9101 listener, never on this public router.
	r.Use(metrics.Middleware)

	r.Use(middleware.RequestID)
	// No RealIP: it rewrites RemoteAddr from client-controlled headers
	// (X-Forwarded-For / True-Client-IP / X-Real-IP) whether or not the
	// infrastructure sets them, so the logged IP was forgeable — see
	// GHSA-3fxj-6jh8-hvhx. RemoteAddr is now the real TCP peer (the reverse
	// proxy in prod). Anything that needs the originating client IP must
	// resolve X-Forwarded-For against a trusted-proxy set, not trust it blindly.
	r.Use(middleware.Recoverer)
	r.Use(slogchi.NewWithConfig(logger, slogchi.Config{
		DefaultLevel:     slog.LevelInfo,
		ClientErrorLevel: slog.LevelWarn,
		ServerErrorLevel: slog.LevelError,
		WithRequestID:    true,
		Filters: []slogchi.Filter{
			slogchi.IgnorePath("/healthz", "/readyz"),
		},
	}))

	hz := healthz.New(healthz.Config{Service: "gateway-service"})
	hz.MarkReady()
	r.Get("/healthz", hz.Live)
	r.Get("/readyz", hz.Ready)

	apiServer := httpapi.New(svc)
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
	// SSE stays authenticated but unscoped: a job id is 128 random bits and the
	// payload names a kind and a slug, not a blob. Scoping the stream is a
	// different question — about a job, not about content — and is deliberately
	// left out here.
	r.With(authH.Authenticate).Get("/api/jobs/{id}/events", apiServer.WatchJobEvents)

	// Owner-only Prometheus proxy. Authenticated (for the owner check) but
	// outside the openapi strict handlers — it resolves a panel ID to
	// server-side PromQL and proxies Prometheus, like the asset proxy for GLBs.
	r.With(authH.Authenticate).Get("/api/metrics/query", metricsHandler.ServeHTTP)

	// Audit CSV export. On the root router because ETagMiddleware hashes the
	// whole response body — i.e. buffers it — which defeats a streaming export.
	// Its gate is applied by hand: RequirePermissionForRoute only covers the
	// /api JSON sub-router below.
	r.With(authH.Authenticate, authH.Require("audit:read")).
		Get("/api/audit.csv", apiServer.ServeAuditCSV)

	// /api/auth/* on the root router: login/2fa are public; self/admin
	// handlers validate the Bearer token themselves via the auth client.
	authH.Mount(r)

	// /api JSON sub-router: authenticate + per-route permission gate, then
	// ETag + Compress, then the openapi strict handlers.
	r.Group(func(api chi.Router) {
		api.Use(authH.Authenticate)
		api.Use(authhttp.RequirePermissionForRoute)
		// After the permission gate on purpose: that one costs no network, so a
		// caller already heading for a 403 does not first buy a catalog lookup.
		api.Use(apiServer.RequireTerritoryAccess)
		// After the gates and before the handlers: a request that is going to be
		// refused for lack of permission or tenant should not first be told its
		// CSRF token is stale.
		api.Use(authH.RequireCSRF)
		api.Use(httpapi.ETagMiddleware)
		api.Use(newCompressor().Handler)
		httpapi.HandlerFromMux(
			httpapi.NewStrictHandler(apiServer, nil),
			api,
		)
	})

	return r, hz
}

// newRouterWithCORS builds the root router, carrying the CORS handler only when
// there is something to allow.
//
// An empty list must mean "no cross-origin access". go-chi/cors disagrees: an
// empty AllowedOrigins with no AllowOriginFunc sets allowedOriginsAll and echoes
// every origin (cors.go:131). Blanking the config is therefore a way to turn
// CORS fully ON, and not mounting the handler is the only way to say none.
//
// The SPA is same-origin with this API in dev and prod alike — nginx serves it
// and proxies /api, Vite does the same — so it is preflighted nowhere and needs
// none of this. The knob stays for a third-party consumer of the API, should one
// appear; ExposedHeaders is what such a client would need, since the
// chunked-upload protocol answers with Upload-Offset / Upload-Length and a
// browser hides those from script unless they are exposed.
func newRouterWithCORS(origins []string) chi.Router {
	r := chi.NewRouter()
	if len(origins) == 0 {
		return r
	}
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   origins,
		AllowedMethods:   []string{http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowedHeaders:   []string{"Content-Type", "If-None-Match", "Authorization", "Upload-Offset", "X-CSRF-Token"},
		ExposedHeaders:   []string{"ETag", "Content-Length", "Content-Range", "X-Next-Cursor", "Upload-Offset", "Upload-Length"},
		AllowCredentials: true,
		MaxAge:           300,
	}))
	return r
}

// newCompressor configures chi's Compressor with brotli registered alongside
// the default gzip/deflate. Brotli ratio is ~15% better than gzip for JSON;
// chi negotiates Accept-Encoding by client q-value and picks the best match.
//
// Compression level 5 is a balanced default — gzip's "best compression" (9)
// burns CPU for marginal size gain on JSON payloads in the kB range.
func newCompressor() *middleware.Compressor {
	const level = 5
	c := middleware.NewCompressor(
		level,
		"application/json",
		"application/javascript",
		"application/xml",
		"text/plain",
		"text/html",
		"text/css",
	)
	c.SetEncoder("br", func(w io.Writer, lvl int) io.Writer {
		return brotli.NewWriterLevel(w, lvl)
	})
	return c
}
