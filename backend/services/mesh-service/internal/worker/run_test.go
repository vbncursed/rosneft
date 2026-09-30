package worker

import (
	"context"
	"io"
	"log/slog"
	"sync/atomic"
	"testing"
	"time"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/storage"
)

type fakeQueue struct{ consumed atomic.Int32 }

func (q *fakeQueue) ConsumeJobs(ctx context.Context, _ string, _ time.Duration) ([]storage.DeliveredJob, error) {
	n := q.consumed.Add(1)
	if n > 1 {
		// Later reads behave like an idle stream, so a loop that reads without
		// a free slot shows up as a count, not as a hang.
		<-ctx.Done()
		return nil, nil
	}
	return []storage.DeliveredJob{{MessageID: "m1", JobID: "j1"}}, nil
}

func (q *fakeQueue) AckJob(context.Context, string) error { return nil }

type blockingMesh struct {
	started chan struct{}
	release chan struct{}
}

func (m *blockingMesh) ProcessJob(context.Context, string) error {
	close(m.started)
	<-m.release
	return nil
}

// A read is only made when a slot is free, so a job still waiting stays in the
// stream instead of sitting in this worker's pending list, out of reach of any
// other worker if this one is killed.
func TestRunReadsNothingWhileEverySlotIsBusy(t *testing.T) {
	q := &fakeQueue{}
	m := &blockingMesh{started: make(chan struct{}), release: make(chan struct{})}
	w := New(Config{
		Queue: q, Mesh: m, Name: "w", MaxConcurrent: 1,
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan struct{})
	go func() { w.Run(ctx); close(done) }()

	<-m.started
	// Give a loop that ignores the slot time to read again.
	time.Sleep(100 * time.Millisecond)
	assert.Equal(t, q.consumed.Load(), int32(1))

	close(m.release)
	assert.Assert(t, waitFor(func() bool { return q.consumed.Load() == 2 }), "no read after the slot freed")
	cancel()
	<-done
}

func waitFor(cond func() bool) bool {
	for range 200 {
		if cond() {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return false
}
