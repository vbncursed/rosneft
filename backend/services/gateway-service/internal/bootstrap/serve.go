package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os/signal"
	"syscall"

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
	defer cat.Close()

	con, err := InitContent(cfg)
	if err != nil {
		return fmt.Errorf("init content: %w", err)
	}
	defer con.Close()

	m, err := InitMesh(cfg)
	if err != nil {
		return fmt.Errorf("init mesh: %w", err)
	}
	defer m.Close()

	up, err := InitUpload(cfg)
	if err != nil {
		return fmt.Errorf("init upload: %w", err)
	}
	defer up.Close()

	authClient, err := InitAuth(cfg)
	if err != nil {
		return fmt.Errorf("init auth: %w", err)
	}
	defer authClient.Close()

	twofaClient, err := InitTwoFA(cfg)
	if err != nil {
		return fmt.Errorf("init twofa: %w", err)
	}
	defer twofaClient.Close()

	passkeyClient, err := InitPasskey(cfg)
	if err != nil {
		return fmt.Errorf("init passkey: %w", err)
	}
	defer passkeyClient.Close()

	svc := InitService(cat, con, m, up)
	authH := authhttp.New(authClient, twofaClient, passkeyClient, logger)

	assetProxy, err := InitAssetProxy(cfg)
	if err != nil {
		return fmt.Errorf("init asset proxy: %w", err)
	}

	router, hz := InitRouter(svc, assetProxy, authH, logger, cfg)

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
