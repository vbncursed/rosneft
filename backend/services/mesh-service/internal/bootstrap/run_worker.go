package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	"github.com/vbncursed/rosneft/backend/pkg/metrics"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/config"
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
	defer func() { _ = rdb.Close() }()

	store, err := InitStorage(rootCtx, rdb)
	if err != nil {
		return fmt.Errorf("init storage: %w", err)
	}

	cat, err := InitCatalog(cfg)
	if err != nil {
		return fmt.Errorf("init catalog: %w", err)
	}
	defer func() { _ = cat.Close() }()

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

	// Capacity 1: signals from a burst of finished jobs coalesce into one.
	jobDone := make(chan struct{}, 1)
	w := InitWorker(store, svc, logger, cfg, jobDone)

	// Reconciler runs alongside the consume loop: queues conversions for any
	// catalog project missing a LOD0 artifact. First pass retries with
	// backoff because catalog might still be coming up.
	go runReconciler(rootCtx, svc, jobDone)

	go grpcutil.WatchReadiness(rootCtx, grpcutil.ReadinessConfig{
		Service: "mesh-worker",
		Probe:   func(ctx context.Context) error { return rdb.Ping(ctx).Err() },
		Logger:  logger,
	})

	go func() {
		if err := metrics.Serve(cfg.MetricsAddr); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("metrics: listener failed", "err", err)
		}
	}()
	logger.Info("metrics: serving", "addr", cfg.MetricsAddr)
	logger.Info("mesh-worker: entering consume loop")
	w.Run(rootCtx)
	logger.Info("mesh-worker: stopped")
	return nil
}

// reconciler is the one service method the reconcile loop drives.
type reconciler interface {
	ReconcileMissingArtifacts(ctx context.Context) (int, error)
}

func runReconciler(ctx context.Context, svc reconciler, kick <-chan struct{}) {
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
	reconcileLoop(ctx, svc, t.C, kick)
}

// reconcileLoop runs a pass on every tick and, when kick is set, on every
// signal. The signal path is what drains the plain-copy backfill: each
// successful job pokes it, so the next backfill is queued as soon as the
// worker is idle instead of 5 minutes later. It cannot spin: a pass runs only
// on a signal or a tick, a signal comes only from a job that finished, and
// a pass that queues nothing produces no job. A failed job sends no signal.
func reconcileLoop(ctx context.Context, svc reconciler, tick <-chan time.Time, kick <-chan struct{}) {
	logger := slogFromCtx()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick:
		case <-kick:
		}
		n, err := svc.ReconcileMissingArtifacts(ctx)
		if err != nil {
			logger.Warn("reconcile: pass failed", "err", err)
			continue
		}
		if n > 0 {
			logger.Info("reconcile: pass queued", "count", n)
		}
	}
}
