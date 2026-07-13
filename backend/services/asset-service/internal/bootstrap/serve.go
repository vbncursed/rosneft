package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os/signal"
	"syscall"

	"github.com/vbncursed/rosneft/backend/pkg/metrics"
	"github.com/vbncursed/rosneft/backend/services/asset-service/internal/config"
)

// RunServe is the full lifecycle of the asset HTTP server: blobstore →
// service → mux → ListenAndServe → graceful shutdown.
func RunServe(ctx context.Context, cfg config.Config) error {
	logger := InitLogger(cfg)
	logger.Info("asset: starting", "http_addr", cfg.HTTPAddr, "blob_dir", cfg.BlobDir)

	rootCtx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	store, err := InitBlobStore(cfg)
	if err != nil {
		return fmt.Errorf("init blobstore: %w", err)
	}
	svc := InitService(store)
	mux, hz := InitMux(svc, logger)

	srv := &http.Server{
		Addr: cfg.HTTPAddr,
		// Record HTTP RED for every request. /metrics is served only on the
		// internal :9101 listener, never on this asset-serving handler.
		Handler:           metrics.Middleware(mux),
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
	logger.Info("asset: serving HTTP", "addr", cfg.HTTPAddr)

	select {
	case <-rootCtx.Done():
		logger.Info("asset: shutdown signal received")
	case err := <-serveErr:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("http serve: %w", err)
		}
	}

	hz.MarkNotReady()

	stopCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(stopCtx); err != nil {
		logger.Warn("asset: shutdown forced", "err", err)
	} else {
		logger.Info("asset: graceful shutdown complete")
	}
	return nil
}
