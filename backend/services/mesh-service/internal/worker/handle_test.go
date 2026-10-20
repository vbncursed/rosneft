package worker

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/storage"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/worker/mocks"
)

func newHandleWorker(t *testing.T, processErr error, succeeded chan<- struct{}) *Worker {
	mc := minimock.NewController(t)
	queue := mocks.NewQueueMock(mc)
	if processErr == nil {
		queue.AckJobMock.Return(nil)
	}
	mesh := mocks.NewMeshMock(mc)
	mesh.ProcessJobMock.Return(processErr)
	return New(Config{
		Queue: queue, Mesh: mesh, Name: "w", MaxConcurrent: 1,
		Logger:    slog.New(slog.NewTextHandler(io.Discard, nil)),
		Succeeded: succeeded,
	})
}

// A finished job signals the reconciler so the backfill backlog drains back
// to back instead of one target per tick.
func TestHandleOne_SignalsAfterASuccess(t *testing.T) {
	succeeded := make(chan struct{}, 1)
	w := newHandleWorker(t, nil, succeeded)

	w.handleOne(context.Background(), storage.DeliveredJob{MessageID: "m", JobID: "j"})

	assert.Equal(t, len(succeeded), 1)
}

// A failed job must not signal: a failing backfill would be queued again at
// once, forever. Only the tick retries it.
func TestHandleOne_DoesNotSignalAfterAFailure(t *testing.T) {
	succeeded := make(chan struct{}, 1)
	w := newHandleWorker(t, errors.New("convert failed"), succeeded)

	w.handleOne(context.Background(), storage.DeliveredJob{MessageID: "m", JobID: "j"})

	assert.Equal(t, len(succeeded), 0)
}

// Many completions in a row leave one pending signal, and a full channel
// never blocks the worker's slot.
func TestHandleOne_CoalescesSignalsAndNeverBlocks(t *testing.T) {
	succeeded := make(chan struct{}, 1)
	w := newHandleWorker(t, nil, succeeded)

	for range 5 { // nobody reads; a blocking send would hang here
		w.handleOne(context.Background(), storage.DeliveredJob{MessageID: "m", JobID: "j"})
	}

	assert.Equal(t, len(succeeded), 1)
}

// No channel configured (tests, other wiring) is fine.
func TestHandleOne_NilSignalChannelIsFine(t *testing.T) {
	w := newHandleWorker(t, nil, nil)

	w.handleOne(context.Background(), storage.DeliveredJob{MessageID: "m", JobID: "j"})
}
