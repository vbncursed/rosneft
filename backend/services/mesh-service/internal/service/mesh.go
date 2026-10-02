// Package service is the mesh business layer. mesh-api exposes SubmitConversion
// and GetJob over gRPC; mesh-worker drives ProcessJob from the Redis stream.
// One method per file — this file holds the contracts and the constructor.
package service

import (
	"context"
	"io"
	"time"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

//go:generate minimock -i Queue,Catalog,Converter,BlobStore -o ./mocks -s _mock.go

// Queue is the persistence + queue contract — both API and worker use it.
type Queue interface {
	SaveJob(ctx context.Context, j domain.Job) error
	GetJob(ctx context.Context, id string) (domain.Job, error)

	// ListTargetJobs returns the latest job of every target that has one, in
	// kind-then-slug order. Every status is included; callers decide what a
	// succeeded job still means to them.
	ListTargetJobs(ctx context.Context) ([]domain.Job, error)

	EnqueueJob(ctx context.Context, jobID string) error

	// TryLockTarget claims a target for one conversion. Reports false when
	// another attempt already holds it. The lock is what stops the reconciler
	// re-queueing an entity whose conversion is still running, and what stops
	// a user-initiated submit racing the reconciler: HasLOD0 only turns true
	// at the very end of processing, so a conversion longer than the tick
	// interval would otherwise be queued again on every tick.
	TryLockTarget(ctx context.Context, kind domain.Kind, slug string, ttl time.Duration) (bool, error)

	// HoldTarget claims a target unconditionally, restarting its TTL. The
	// worker calls it as a job starts, so the claim bounds the run alone and
	// never the time the job waited in the stream.
	HoldTarget(ctx context.Context, kind domain.Kind, slug string, ttl time.Duration) error

	// UnlockTarget releases the claim. Failing to call it is not fatal — the
	// TTL expires — but it delays the next legitimate reconcile.
	UnlockTarget(ctx context.Context, kind domain.Kind, slug string) error

	// ForgetTarget drops the target's entry from the index. The job hash
	// stays: a subscriber holding the id must still be able to read it.
	ForgetTarget(ctx context.Context, kind domain.Kind, slug string) error
}

// Catalog is the catalog client surface used by ProcessJob and the
// reconciler. The Kind+Slug pair identifies whether a target is a territory
// or a model; HasLOD0 reports whether the catalog already has a LOD0
// artifact (used by the reconciler to skip already-converted entities).
type Catalog interface {
	GetTarget(ctx context.Context, kind domain.Kind, slug string) (domain.ConversionTarget, error)
	ListTargets(ctx context.Context) ([]domain.ConversionTarget, error)
	HasLOD0(ctx context.Context, kind domain.Kind, slug string) (bool, error)
	RegisterArtifact(ctx context.Context, a domain.Artifact) error
	RescaleTerritoryPlacements(ctx context.Context, slug string, newMax float64, newCenter domain.Vec3) error
}

// Converter turns a source mesh on disk into one or more ConversionResults
// — one per LOD level, ordered LOD0 → LODN. The worker hands a path to the
// extracted .obj file and the directory the whole archive was extracted to;
// the converter resolves the OBJ's mtllib and texture references relative to
// that file's directory, and refuses any that leave root.
type Converter interface {
	ConvertLODs(ctx context.Context, root, sourcePath string) ([]domain.ConversionResult, error)
}

// BlobStore is what the worker writes converted artifacts to and reads
// source archives from.
type BlobStore interface {
	Put(ctx context.Context, hash, contentType string, r io.Reader) (blobstore.Blob, error)
	Get(ctx context.Context, hash string) (io.ReadCloser, blobstore.Blob, error)
}

// Mesh is the mesh business layer.
type Mesh struct {
	queue     Queue
	catalog   Catalog
	converter Converter
	blobs     BlobStore
	// idGen returns a fresh job ID; injectable for deterministic tests.
	idGen func() string
	// now is the clock SubmitConversion ages a queued job by; injectable for tests.
	now func() time.Time
}

// Config wires Mesh's dependencies.
type Config struct {
	Queue     Queue
	Catalog   Catalog
	Converter Converter
	Blobs     BlobStore
	IDGen     func() string
	// Now defaults to time.Now.
	Now func() time.Time
}

// New constructs a Mesh service.
func New(cfg Config) *Mesh {
	now := cfg.Now
	if now == nil {
		now = time.Now
	}
	return &Mesh{
		queue:     cfg.Queue,
		catalog:   cfg.Catalog,
		converter: cfg.Converter,
		blobs:     cfg.Blobs,
		idGen:     cfg.IDGen,
		now:       now,
	}
}
