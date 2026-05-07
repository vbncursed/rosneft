package bootstrap

import (
	"net/http"

	"github.com/vbncursed/rosneft/backend/pkg/healthz"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/httpapi"
)

// Compile-time assertions: gateway service satisfies the transport contract,
// and the openapi-generated handler satisfies oapi-codegen's strict interface.
var (
	_ httpapi.Service               = (*service.Gateway)(nil)
	_ httpapi.StrictServerInterface = (*httpapi.Server)(nil)
)

// InitMux builds the HTTP mux: openapi-driven handlers (wrapped with ETag +
// compression middleware) + healthz + binary asset proxy + Scalar UI.
//
// Asset proxy is intentionally registered on the outer mux so it bypasses the
// JSON middleware chain — GLB binaries already carry asset-service ETag and
// would only waste CPU if compressed (Draco output is incompressible noise).
func InitMux(svc *service.Gateway, assetProxy http.Handler, cfg config.Config) (*http.ServeMux, *healthz.Handler) {
	mux := http.NewServeMux()

	hz := healthz.New(healthz.Config{Service: "gateway-service"})
	hz.Mount(mux)
	hz.MarkReady()

	apiServer := httpapi.New(svc)

	// Sub-mux for typed OpenAPI routes — wrapped with ETag + compression.
	apiMux := http.NewServeMux()
	_ = httpapi.HandlerWithOptions(
		httpapi.NewStrictHandler(apiServer, nil),
		httpapi.StdHTTPServerOptions{BaseRouter: apiMux},
	)
	wrappedAPI := httpapi.ETagMiddleware(httpapi.CompressionMiddleware(apiMux))
	mux.Handle("/api/", wrappedAPI)

	// API reference UI (Scalar) + machine-readable spec.
	mux.HandleFunc("GET /docs", apiServer.ServeDocs)
	mux.HandleFunc("GET /openapi.json", apiServer.ServeSpec)

	// SSE conversion stream — registered outside the JSON middleware chain
	// so ETag and compression don't buffer or transform the event stream.
	mux.HandleFunc("GET /api/jobs/{id}/events", apiServer.WatchJobEvents)

	// Binary asset proxy — most-specific patterns win in Go 1.22+ ServeMux,
	// so /api/assets/{hash} overrides the /api/ catch-all above.
	mux.Handle("GET /api/assets/{hash}", assetProxy)
	mux.Handle("HEAD /api/assets/{hash}", assetProxy)

	return mux, hz
}

// WithCORS wraps mux with the configured CORS middleware.
func WithCORS(mux *http.ServeMux, cfg config.Config) http.Handler {
	return httpapi.CORSMiddleware(cfg.AllowedOrigins)(mux)
}
