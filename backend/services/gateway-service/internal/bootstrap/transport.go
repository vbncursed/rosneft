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

	// The SPA is cross-origin (no same-origin BFF since the Next.js proxy went
	// away), so the chunked-upload protocol rides on CORS: PATCH sends the
	// required Upload-Offset request header, HEAD carries a Bearer token — which
	// makes it preflighted, not a simple request — and both answer with
	// Upload-Offset / Upload-Length that the browser hides unless exposed.
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

	// Binary asset proxy + SSE — outside the JSON middleware chain.
	r.Get("/api/assets/{hash}", assetProxy.ServeHTTP)
	r.Head("/api/assets/{hash}", assetProxy.ServeHTTP)
	r.Get("/api/jobs/{id}/events", apiServer.WatchJobEvents)

	// Owner-only Prometheus proxy. Authenticated (for the owner check) but
	// outside the openapi strict handlers — it resolves a panel ID to
	// server-side PromQL and proxies Prometheus, like the asset proxy for GLBs.
	r.With(authH.Authenticate).Get("/api/metrics/query", metricsHandler.ServeHTTP)

	// /api/auth/* on the root router: login/2fa are public; self/admin
	// handlers validate the Bearer token themselves via the auth client.
	authH.Mount(r)

	// /api JSON sub-router: authenticate + per-route permission gate, then
	// ETag + Compress, then the openapi strict handlers.
	r.Group(func(api chi.Router) {
		api.Use(authH.Authenticate)
		api.Use(authhttp.RequirePermissionForRoute)
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
