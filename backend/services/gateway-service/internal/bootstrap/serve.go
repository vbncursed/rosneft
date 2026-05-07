package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os/signal"
	"syscall"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
)

// RunServe is the full lifecycle of the gateway HTTP server: catalog +
// mesh clients → asset proxy → service → mux → ListenAndServe → graceful
// shutdown.
func RunServe(ctx context.Context, cfg config.Config) error {
	logger := InitLogger(cfg)
	logger.Info("gateway: starting",
		"http_addr", cfg.HTTPAddr,
		"catalog_addr", cfg.CatalogGRPCAddr,
		"mesh_addr", cfg.MeshGRPCAddr,
		"asset_addr", cfg.AssetHTTPAddr,
	)

	rootCtx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cat, err := InitCatalog(cfg)
	if err != nil {
		return fmt.Errorf("init catalog: %w", err)
	}
	defer cat.Close()

	m, err := InitMesh(cfg)
	if err != nil {
		return fmt.Errorf("init mesh: %w", err)
	}
	defer m.Close()

	svc := InitService(cat, m)

	assetProxy, err := InitAssetProxy(cfg)
	if err != nil {
		return fmt.Errorf("init asset proxy: %w", err)
	}

	mux, hz := InitMux(svc, assetProxy, cfg)
	handler := WithCORS(mux, cfg)

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           handler,
		ReadHeaderTimeout: cfg.ReadTimeout,
		ReadTimeout:       cfg.ReadTimeout,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       cfg.IdleTimeout,
	}

	serveErr := make(chan error, 1)
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
