package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	"github.com/vbncursed/rosneft/backend/pkg/healthz"
	"github.com/vbncursed/rosneft/backend/pkg/metrics"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// RunServe is the full lifecycle of the gateway HTTP server: catalog +
// mesh clients → asset proxy → service → mux → ListenAndServe → graceful
// shutdown.
func RunServe(ctx context.Context, cfg config.Config) error {
	logger := InitLogger(cfg)
	logger.Info("gateway: starting",
		"http_addr", cfg.HTTPAddr,
		"catalog_addr", cfg.CatalogGRPCAddr,
		"content_addr", cfg.ContentGRPCAddr,
		"mesh_addr", cfg.MeshGRPCAddr,
		"upload_addr", cfg.UploadGRPCAddr,
		"asset_addr", cfg.AssetHTTPAddr,
	)

	rootCtx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	gc, err := dialClients(cfg)
	if err != nil {
		return err
	}
	defer gc.Close()

	router, hz, err := buildRouter(cfg, gc, logger)
	if err != nil {
		return err
	}

	// gateway runs no gRPC server (Health stays nil) but is a Prometheus
	// scrape target like every gRPC service, so it needs the same
	// service_ready gauge or ServiceNotReady can never fire for it — see the
	// gauge's own doc comment: a process whose backends have died still
	// serves /metrics, so `up` stays 1 and TargetDown never notices. hz.CheckAll
	// reuses the eight backend probes already registered in InitRouter rather
	// than duplicating that list here.
	go grpcutil.WatchReadiness(rootCtx, grpcutil.ReadinessConfig{
		Service: "gateway",
		Probe:   hz.CheckAll,
		Logger:  logger,
	})

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           router,
		ReadHeaderTimeout: cfg.ReadTimeout,
		ReadTimeout:       cfg.ReadTimeout,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       cfg.IdleTimeout,
	}
	if err := serveUntilDone(rootCtx, srv, cfg.MetricsAddr, logger); err != nil {
		return err
	}

	//nolint:contextcheck // shutdown must outlive rootCtx, already cancelled here; shutdownHTTP builds a fresh timeout context by design
	shutdownHTTP(srv, hz, cfg.ShutdownTimeout, logger)
	return nil
}

// buildRouter wires the service, the auth handlers, the asset proxy and the
// console endpoints onto the root router.
func buildRouter(cfg config.Config, gc *gatewayClients, logger *slog.Logger) (chi.Router, *healthz.Handler, error) {
	svc := InitService(gc.cat, gc.con, gc.mesh, gc.up, gc.audit, gc.auth)
	authH := authhttp.New(gc.auth, gc.twofa, gc.passkey, gc.audit, gc.cat, logger,
		authhttp.CookieOptions{Secure: cfg.CookieSecure, TTL: cfg.SessionCookieTTL},
		[]byte(cfg.CSRFSecret))

	assetProxy, err := InitAssetProxy(cfg)
	if err != nil {
		return nil, nil, fmt.Errorf("init asset proxy: %w", err)
	}
	assetClient, err := InitAssetClient(cfg)
	if err != nil {
		return nil, nil, fmt.Errorf("init asset client: %w", err)
	}

	prom := InitPrometheus(cfg)
	router, hz := InitRouter(
		svc,
		assetProxy,
		assetClient.Open,
		InitMetricsHandler(prom, logger),
		InitConsoleSummary(svc, gc.auth, prom, logger),
		authH,
		logger,
		cfg,
		gc.conns(),
	)
	return router, hz, nil
}

// serveUntilDone starts the metrics listener and the HTTP server and blocks
// until the context is cancelled (nil) or the HTTP server fails.
func serveUntilDone(ctx context.Context, srv *http.Server, metricsAddr string, logger *slog.Logger) error {
	serveErr := make(chan error, 1)
	go func() {
		if err := metrics.Serve(metricsAddr); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("metrics: listener failed", "err", err)
		}
	}()
	logger.Info("metrics: serving", "addr", metricsAddr)
	go func() { serveErr <- srv.ListenAndServe() }()
	logger.Info("gateway: serving HTTP", "addr", srv.Addr)

	select {
	case <-ctx.Done():
		logger.Info("gateway: shutdown signal received")
	case err := <-serveErr:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("http serve: %w", err)
		}
	}
	return nil
}

// shutdownHTTP flips /readyz to not-ready first, so the balancer stops sending
// traffic, then drains the server within timeout. The context is a fresh one:
// the run context is already cancelled when this is called.
func shutdownHTTP(srv *http.Server, hz *healthz.Handler, timeout time.Duration, logger *slog.Logger) {
	hz.MarkNotReady()
	stopCtx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	if err := srv.Shutdown(stopCtx); err != nil {
		logger.Warn("gateway: shutdown forced", "err", err)
		return
	}
	logger.Info("gateway: graceful shutdown complete")
}
