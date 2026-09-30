package worker

import (
	"context"
	"errors"
	"sync"
	"time"
)

// Run blocks consuming jobs until ctx is cancelled. It takes a slot from the
// counting semaphore (Worker.sem) before it reads, and reads one message per
// slot, so the number of in-flight conversions never exceeds
// Config.MaxConcurrent and a job that has not started is still in the stream —
// deliverable to any live worker — rather than parked in this one's pending
// list. Failed jobs are NOT acked, but that message is never reclaimed either:
// this service calls XReadGroup and XAck only, no XAUTOCLAIM/XCLAIM, so an
// unacked entry just sits pending forever. Recovery instead comes from
// ReconcileMissingArtifacts: the target still has no LOD0 artifact, so it
// gets re-queued as a brand-new job on a later reconciler tick.
func (w *Worker) Run(ctx context.Context) {
	var wg sync.WaitGroup
	for {
		w.observeBacklog(ctx)
		// A slot first, then a message: nothing is read that cannot start now.
		select {
		case <-ctx.Done():
			wg.Wait()
			return
		case w.sem <- struct{}{}:
		}
		jobs, err := w.queue.ConsumeJobs(ctx, w.name, w.blockTimeout)
		if err != nil || len(jobs) == 0 {
			<-w.sem
			if err != nil && !errors.Is(err, context.Canceled) {
				w.logger.Error("worker: consume failed", "err", err)
				time.Sleep(time.Second)
			}
			continue
		}
		for _, j := range jobs {
			wg.Go(func() {
				defer func() { <-w.sem }()
				w.handleOne(ctx, j)
			})
		}
	}
}

// observeBacklog publishes the queue depth. A failed read is logged and leaves
// the gauge where it was: a stale number beats a false zero, and the loop goes
// on. Cancellation is not worth a warning.
func (w *Worker) observeBacklog(ctx context.Context) {
	n, err := w.queue.Backlog(ctx)
	if err != nil {
		if !errors.Is(err, context.Canceled) {
			w.logger.Warn("worker: backlog read failed", "err", err)
		}
		return
	}
	metricQueueDepth.Set(float64(n))
}
