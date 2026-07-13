package worker

import (
	"context"
	"errors"
	"sync"
	"time"
)

// Run blocks consuming jobs until ctx is cancelled. Each consumed job runs in
// its own goroutine but is gated by a counting semaphore (Worker.sem) so the
// number of in-flight conversions never exceeds Config.MaxConcurrent. Failed
// jobs are NOT acked so they can be reclaimed by another consumer.
func (w *Worker) Run(ctx context.Context) {
	var wg sync.WaitGroup
	for {
		if err := ctx.Err(); err != nil {
			break
		}
		jobs, err := w.queue.ConsumeJobs(ctx, w.name, w.blockTimeout)
		if err != nil {
			if errors.Is(err, context.Canceled) {
				break
			}
			w.logger.Error("worker: consume failed", "err", err)
			time.Sleep(time.Second)
			continue
		}
		metricQueueDepth.Set(float64(len(jobs)))
		for _, j := range jobs {
			// Acquire a slot before spawning. If ctx cancels while waiting,
			// drop the batch and let the message stay un-acked for reclaim.
			select {
			case <-ctx.Done():
				wg.Wait()
				return
			case w.sem <- struct{}{}:
			}
			wg.Go(func() {
				defer func() { <-w.sem }()
				w.handleOne(ctx, j)
			})
		}
	}
	wg.Wait()
}
