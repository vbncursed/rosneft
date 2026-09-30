// Package worker is the Redis Streams consumer loop for mesh-worker. One
// method per file. This file holds the Queue + Mesh contracts and the
// Worker constructor.
package worker

import (
	"context"
	"log/slog"
	"runtime"
	"time"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/storage"
)

// Queue is the consumer surface the worker needs.
type Queue interface {
	ConsumeJobs(ctx context.Context, consumer string, block time.Duration) ([]storage.DeliveredJob, error)
	AckJob(ctx context.Context, messageID string) error
	// Backlog is the number of queued jobs no worker has been handed yet.
	Backlog(ctx context.Context) (int64, error)
}

// Mesh is the business surface the worker drives.
type Mesh interface {
	ProcessJob(ctx context.Context, jobID string) error
}

// Worker consumes jobs from the queue and dispatches them to the mesh service
// with bounded concurrency.
type Worker struct {
	queue        Queue
	mesh         Mesh
	logger       *slog.Logger
	name         string
	blockTimeout time.Duration
	// sem is a counting semaphore that caps the number of in-flight
	// conversions. Each one runs its own gltfpack, which peaked at 4.0 GB on
	// three 8192² textures, so the configured default is 1:
	// parallel jobs multiply memory, not throughput, on the 8 GB host this
	// ships to.
	sem chan struct{}
}

// Config wires the Worker.
type Config struct {
	Queue        Queue
	Mesh         Mesh
	Logger       *slog.Logger
	Name         string
	BlockTimeout time.Duration
	// MaxConcurrent caps parallel conversions. <=0 defaults to GOMAXPROCS.
	MaxConcurrent int
}

// New constructs a Worker.
func New(cfg Config) *Worker {
	n := cfg.MaxConcurrent
	if n <= 0 {
		n = runtime.GOMAXPROCS(0)
	}
	return &Worker{
		queue:        cfg.Queue,
		mesh:         cfg.Mesh,
		logger:       cfg.Logger,
		name:         cfg.Name,
		blockTimeout: cfg.BlockTimeout,
		sem:          make(chan struct{}, n),
	}
}
