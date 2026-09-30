package worker

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"testing/synctest"
	"time"

	"github.com/gojuno/minimock/v3"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/storage"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/worker/mocks"
)

// blockTimeout is how long an empty read blocks, on the bubble's fake clock.
const blockTimeout = 5 * time.Second

// Each test runs inside a synctest bubble: synctest.Wait returns once every
// goroutine of the loop is blocked, so "the loop did not read" is an
// observation, not a guess about how long to sleep. The worker and every
// channel the mocks block on are made inside the bubble, or the loop's
// blocking would not count as durable.
type RunSuite struct {
	suite.Suite
	queue *mocks.QueueMock
	mesh  *mocks.MeshMock
}

func TestRunSuite(t *testing.T) { suite.Run(t, new(RunSuite)) }

func (s *RunSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.queue = mocks.NewQueueMock(mc)
	s.mesh = mocks.NewMeshMock(mc)
}

// start runs the loop with one slot, on the bubble's t. The first read delivers job j1, whose
// conversion blocks until release is closed; every later read is idle for
// blockTimeout, the way XREADGROUP BLOCK is on an empty stream. The returned
// stop cancels the loop and waits for it to return.
func (s *RunSuite) start(t *testing.T, release <-chan struct{}) (stop func()) {
	s.queue.ConsumeJobsMock.Set(func(ctx context.Context, _ string, block time.Duration) ([]storage.DeliveredJob, error) {
		if s.queue.ConsumeJobsBeforeCounter() == 1 {
			return []storage.DeliveredJob{{MessageID: "m1", JobID: "j1"}}, nil
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(block):
			return nil, nil
		}
	})
	s.mesh.ProcessJobMock.Set(func(_ context.Context, jobID string) error {
		assert.Check(s.T(), jobID == "j1", jobID)
		<-release
		return nil
	})
	s.queue.AckJobMock.Expect(minimock.AnyContext, "m1").Return(nil)

	w := New(Config{
		Queue: s.queue, Mesh: s.mesh, Name: "w", MaxConcurrent: 1, BlockTimeout: blockTimeout,
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan struct{})
	go func() { w.Run(ctx); close(done) }()
	return func() { cancel(); <-done }
}

// A read is only made when a slot is free, so a job still waiting stays in the
// stream instead of sitting in this worker's pending list, out of reach of any
// other worker if this one is killed.
func (s *RunSuite) TestReadsNothingWhileEverySlotIsBusy() {
	synctest.Test(s.T(), func(t *testing.T) {
		s.queue.BacklogMock.Return(0, nil)
		release := make(chan struct{})
		stop := s.start(t, release)

		synctest.Wait()
		assert.Equal(t, s.queue.ConsumeJobsBeforeCounter(), uint64(1), "read while the only slot was busy")

		close(release)
		synctest.Wait()
		assert.Equal(t, s.queue.ConsumeJobsBeforeCounter(), uint64(2), "no read after the slot freed")
		stop()
	})
}

// The gauge is the queue's backlog, not the size of what one read returned:
// it follows the value on every turn of the loop, empty reads included, and a
// failed read leaves it where it was without stopping the loop.
func (s *RunSuite) TestPublishesTheBacklogEveryTurn() {
	synctest.Test(s.T(), func(t *testing.T) {
		// One answer per turn: 40, then a failure, then 7.
		turns := []error{nil, errors.New("redis down"), nil}
		values := []int64{40, 0, 7}
		s.queue.BacklogMock.Set(func(ctx context.Context) (int64, error) {
			turn := s.queue.BacklogBeforeCounter() - 1
			if ctx.Err() != nil || turn >= uint64(len(turns)) {
				return 0, context.Canceled
			}
			return values[turn], turns[turn]
		})
		release := make(chan struct{})
		stop := s.start(t, release)

		// Turn 1 read 40 and delivered j1; turn 2's backlog read failed and
		// the turn now waits for the slot.
		synctest.Wait()
		assert.Equal(t, s.queue.BacklogBeforeCounter(), uint64(2))
		assert.Equal(t, testutil.ToFloat64(metricQueueDepth), float64(40), "a failed read replaced the gauge")

		// The slot frees and the loop reads on past the failure.
		close(release)
		synctest.Wait()
		assert.Equal(t, s.queue.ConsumeJobsBeforeCounter(), uint64(2), "loop stopped after a backlog error")

		// That read comes back empty; turn 3 still publishes.
		time.Sleep(blockTimeout)
		synctest.Wait()
		assert.Equal(t, s.queue.ConsumeJobsBeforeCounter(), uint64(3))
		assert.Equal(t, testutil.ToFloat64(metricQueueDepth), float64(7), "an empty turn skipped the gauge")
		stop()
	})
}
