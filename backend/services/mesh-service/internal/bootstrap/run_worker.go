package bootstrap

import (
	"context"
	"fmt"
	"os/signal"
	"syscall"
	"time"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
)

// reconcileTickInterval controls how often the worker re-scans the catalog
// for projects without LOD0 artifacts. 5 minutes is generous — most catalog
// changes flow through SubmitConversion immediately, so this is just a
// belt-and-suspenders backstop.
const reconcileTickInterval = 5 * time.Minute

// RunWorker is the full lifecycle of `mesh-worker`: redis → storage →
// catalog → blobstore → converter → service → reconciler + consume loop,
// all under a signal-aware context.
func RunWorker(ctx context.Context, cfg config.Config) error {
	logger := InitLogger(cfg)
	logger.Info("mesh-worker: starting",
		"redis_addr", cfg.RedisAddr,
		"catalog_addr", cfg.CatalogGRPCAddr,
		"blob_dir", cfg.BlobDir,
		"worker", cfg.WorkerName,
	)

	rootCtx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	rdb, err := InitRedis(rootCtx, cfg)
	if err != nil {
		return err
	}
	defer rdb.Close()

	store, err := InitStorage(rootCtx, rdb)
	if err != nil {
		return fmt.Errorf("init storage: %w", err)
	}

	cat, err := InitCatalog(cfg)
	if err != nil {
		return fmt.Errorf("init catalog: %w", err)
	}
	defer cat.Close()

	blobs, err := InitBlobStore(cfg)
	if err != nil {
		return fmt.Errorf("init blobstore: %w", err)
	}

	comp, err := InitCompressor(rootCtx, cfg, logger)
	if err != nil {
		return fmt.Errorf("init compressor: %w", err)
	}

	conv, err := InitConverter(comp, cfg)
	if err != nil {
		return err
	}
	svc := InitServiceWorker(store, cat, conv, blobs)

	w := InitWorker(store, svc, logger, cfg)

	// Reconciler runs alongside the consume loop: queues conversions for any
	// catalog project missing a LOD0 artifact. First pass retries with
	// backoff because catalog might still be coming up.
	go runReconciler(rootCtx, svc)

	logger.Info("mesh-worker: entering consume loop")
	w.Run(rootCtx)
	logger.Info("mesh-worker: stopped")
	return nil
}

func runReconciler(ctx context.Context, svc *service.Mesh) {
	logger := slogFromCtx()

	// Initial pass with retry — catalog gRPC may not be serving yet.
	for attempt := 1; attempt <= 5; attempt++ {
		if err := ctx.Err(); err != nil {
			return
		}
		n, err := svc.ReconcileMissingArtifacts(ctx)
		if err != nil {
			logger.Warn("reconcile: initial attempt failed", "attempt", attempt, "err", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Duration(attempt) * 2 * time.Second):
			}
			continue
		}
		logger.Info("reconcile: initial pass complete", "queued", n)
		break
	}

	t := time.NewTicker(reconcileTickInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			n, err := svc.ReconcileMissingArtifacts(ctx)
			if err != nil {
				logger.Warn("reconcile: tick failed", "err", err)
				continue
			}
			if n > 0 {
				logger.Info("reconcile: tick queued", "count", n)
			}
		}
	}
}
