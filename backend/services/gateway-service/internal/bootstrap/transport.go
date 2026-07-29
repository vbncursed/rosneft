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
	r := chi.NewRouter()

	// Record HTTP RED for every request (method + status). Outermost so it
	// times the full chain. The /metrics endpoint itself is served only on the
	// internal :9101 listener, never on this public router.
	r.Use(metrics.Middleware)

	// The SPA is same-origin with this API in both dev and prod — nginx serves it
	// and proxies /api, Vite does the same in development — so nothing the SPA
	// does is preflighted any more, and the session cookie needs no CORS help.
	//
	// The configuration stays anyway, deliberately: it costs nothing on
	// same-origin traffic and it is what keeps a non-browser or differently
	// hosted client working. ExposedHeaders in particular is not dead weight —
	// the chunked-upload protocol answers with Upload-Offset / Upload-Length,
	// which a browser hides from script unless they are exposed.
	//
	// AllowCredentials with a wildcard origin looks alarming and is not: the
	// session cookie is SameSite=Lax, so a browser withholds it from cross-site
	// subresource requests whatever this handler replies. Tightening
	// GATEWAY_ALLOWED_ORIGINS is still worth doing — just do it knowing the SPA
	// no longer depends on it.
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   resolveOrigins(cfg.AllowedOrigins),
		AllowedMethods:   []string{http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowedHeaders:   []string{"Content-Type", "If-None-Match", "Authorization", "Upload-Offset"},
		ExposedHeaders:   []string{"ETag", "Content-Length", "Content-Range", "X-Next-Cursor", "Upload-Offset", "Upload-Length"},
		AllowCredentials: true,
		MaxAge:           300,
	}))
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

	// Binary asset proxy + SSE — outside the JSON middleware chain, but no
	// longer outside authentication. Both were reachable anonymously: the hash
	// and the job id are unguessable, so this was a capability URL rather than
	// an open door, but a capability URL has no revocation. Behind the session
	// it inherits one — logout, freeze and a role change all kill it at once.
	//
	// Not territory-scoped, and that is not an omission: a blob hash addresses
	// content and is deduplicated across territories and models, so there is no
	// single territory to check it against. Any authenticated caller who knows a
	// hash can fetch it; after RequireTerritoryAccess, hashes are only handed to
	// callers already inside the tenant.
	r.With(authH.Authenticate).Get("/api/assets/{hash}", assetProxy.ServeHTTP)
	r.With(authH.Authenticate).Head("/api/assets/{hash}", assetProxy.ServeHTTP)
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
		api.Use(httpapi.ETagMiddleware)
		api.Use(newCompressor().Handler)
		httpapi.HandlerFromMux(
			httpapi.NewStrictHandler(apiServer, nil),
			api,
		)
	})

	return r, hz
}

// resolveOrigins maps the configured origin list onto go-chi/cors syntax.
// An empty slice or {"*"} becomes []{"*"} (any origin allowed).
func resolveOrigins(origins []string) []string {
	if len(origins) == 0 {
		return []string{"*"}
	}
	return origins
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
