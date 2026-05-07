package service_test

import (
	"context"
	"io"
	"sync"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// fakeQueue is an in-memory implementation of service.Queue. Concurrent-safe
// because ProcessJob and SubmitConversion may interleave during reconciler
// tests.
type fakeQueue struct {
	mu       sync.Mutex
	jobs     map[string]domain.Job
	enqueued []string

	ErrSave    error
	ErrEnqueue error
	ErrGet     error
}

func newFakeQueue() *fakeQueue {
	return &fakeQueue{jobs: map[string]domain.Job{}}
}

func (q *fakeQueue) SaveJob(_ context.Context, j domain.Job) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.ErrSave != nil {
		return q.ErrSave
	}
	q.jobs[j.ID] = j
	return nil
}

func (q *fakeQueue) GetJob(_ context.Context, id string) (domain.Job, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.ErrGet != nil {
		return domain.Job{}, q.ErrGet
	}
	j, ok := q.jobs[id]
	if !ok {
		return domain.Job{}, domain.ErrJobNotFound
	}
	return j, nil
}

func (q *fakeQueue) EnqueueJob(_ context.Context, jobID string) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.ErrEnqueue != nil {
		return q.ErrEnqueue
	}
	q.enqueued = append(q.enqueued, jobID)
	return nil
}

// fakeCatalog is the test double for service.Catalog.
type fakeCatalog struct {
	mu sync.Mutex

	Targets        []domain.ConversionTarget
	HasLOD0Set     map[string]bool // key = "kind/slug"
	RegisteredArts []domain.Artifact

	ErrListTargets    error
	ErrHasLOD0        error
	ErrGetTarget      error
	ErrRegisterArt    error
	GetTargetResult   domain.ConversionTarget
	GetTargetNotFound bool
}

func newFakeCatalog() *fakeCatalog {
	return &fakeCatalog{HasLOD0Set: map[string]bool{}}
}

func (c *fakeCatalog) GetTarget(_ context.Context, kind domain.Kind, slug string) (domain.ConversionTarget, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.GetTargetNotFound {
		return domain.ConversionTarget{}, domain.ErrTargetNotFound
	}
	if c.ErrGetTarget != nil {
		return domain.ConversionTarget{}, c.ErrGetTarget
	}
	if c.GetTargetResult.Slug != "" {
		return c.GetTargetResult, nil
	}
	return domain.ConversionTarget{Kind: kind, Slug: slug, SourceBlobHash: "src-hash"}, nil
}

func (c *fakeCatalog) ListTargets(_ context.Context) ([]domain.ConversionTarget, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.ErrListTargets != nil {
		return nil, c.ErrListTargets
	}
	return c.Targets, nil
}

func (c *fakeCatalog) HasLOD0(_ context.Context, kind domain.Kind, slug string) (bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.ErrHasLOD0 != nil {
		return false, c.ErrHasLOD0
	}
	return c.HasLOD0Set[kind.String()+"/"+slug], nil
}

func (c *fakeCatalog) RegisterArtifact(_ context.Context, a domain.Artifact) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.ErrRegisterArt != nil {
		return c.ErrRegisterArt
	}
	c.RegisteredArts = append(c.RegisteredArts, a)
	return nil
}

// fakeBlobs implements service.BlobStore. It records Put calls and serves
// pre-staged content from Get for ProcessJob-style tests.
type fakeBlobs struct {
	mu      sync.Mutex
	puts    []blobstore.Blob
	content map[string][]byte // hash -> bytes for Get
}

func (b *fakeBlobs) Put(_ context.Context, hash, contentType string, _ io.Reader) (blobstore.Blob, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	blob := blobstore.Blob{Hash: hash, ContentType: contentType}
	b.puts = append(b.puts, blob)
	return blob, nil
}

func (b *fakeBlobs) Get(_ context.Context, hash string) (io.ReadCloser, blobstore.Blob, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	bytes, ok := b.content[hash]
	if !ok {
		return nil, blobstore.Blob{}, blobstore.ErrNotFound
	}
	return readCloser{bytes: bytes}, blobstore.Blob{Hash: hash, Size: int64(len(bytes))}, nil
}

type readCloser struct {
	bytes []byte
	pos   int
}

func (r readCloser) Read(p []byte) (int, error) {
	if r.pos >= len(r.bytes) {
		return 0, io.EOF
	}
	n := copy(p, r.bytes[r.pos:])
	return n, nil
}

func (r readCloser) Close() error { return nil }

