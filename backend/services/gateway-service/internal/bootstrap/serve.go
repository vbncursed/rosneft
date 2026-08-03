package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os/signal"
	"syscall"

	"google.golang.org/grpc"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
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

	cat, err := InitCatalog(cfg)
	if err != nil {
		return fmt.Errorf("init catalog: %w", err)
	}
	defer func() { _ = cat.Close() }()

	con, err := InitContent(cfg)
	if err != nil {
		return fmt.Errorf("init content: %w", err)
	}
	defer func() { _ = con.Close() }()

	m, err := InitMesh(cfg)
	if err != nil {
		return fmt.Errorf("init mesh: %w", err)
	}
	defer func() { _ = m.Close() }()

	up, err := InitUpload(cfg)
	if err != nil {
		return fmt.Errorf("init upload: %w", err)
	}
	defer func() { _ = up.Close() }()

	authClient, err := InitAuth(cfg)
	if err != nil {
		return fmt.Errorf("init auth: %w", err)
	}
	defer func() { _ = authClient.Close() }()

	twofaClient, err := InitTwoFA(cfg)
	if err != nil {
		return fmt.Errorf("init twofa: %w", err)
	}
	defer func() { _ = twofaClient.Close() }()

	passkeyClient, err := InitPasskey(cfg)
	if err != nil {
		return fmt.Errorf("init passkey: %w", err)
	}
	defer func() { _ = passkeyClient.Close() }()

	auditClient, err := InitAudit(cfg)
	if err != nil {
		return fmt.Errorf("init audit: %w", err)
	}
	defer func() { _ = auditClient.Close() }()

	svc := InitService(cat, con, m, up, auditClient, authClient)
	authH := authhttp.New(authClient, twofaClient, passkeyClient, auditClient, logger,
		authhttp.CookieOptions{Secure: cfg.CookieSecure, TTL: cfg.SessionCookieTTL},
		[]byte(cfg.CSRFSecret))

	assetProxy, err := InitAssetProxy(cfg)
	if err != nil {
		return fmt.Errorf("init asset proxy: %w", err)
	}

	metricsHandler := InitMetricsHandler(cfg, logger)

	backends := map[string]grpc.ClientConnInterface{
		"catalog": cat.Conn(),
		"content": con.Conn(),
		"auth":    authClient.Conn(),
		"twofa":   twofaClient.Conn(),
		"passkey": passkeyClient.Conn(),
		"mesh":    m.Conn(),
		"upload":  up.Conn(),
		"audit":   auditClient.Conn(),
	}

	router, hz := InitRouter(svc, assetProxy, metricsHandler, authH, logger, cfg, backends)

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

	serveErr := make(chan error, 1)
	go func() {
		if err := metrics.Serve(cfg.MetricsAddr); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("metrics: listener failed", "err", err)
		}
	}()
	logger.Info("metrics: serving", "addr", cfg.MetricsAddr)
	go func() { serveErr <- srv.ListenAndServe() }()
	logger.Info("gateway: serving HTTP", "addr", cfg.HTTPAddr)

	select {
	case <-rootCtx.Done():
		logger.Info("gateway: shutdown signal received")
	case err := <-serveErr:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("http serve: %w", err)
		}
	}

	hz.MarkNotReady()

	stopCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(stopCtx); err != nil {
		logger.Warn("gateway: shutdown forced", "err", err)
	} else {
		logger.Info("gateway: graceful shutdown complete")
	}
	return nil
}
