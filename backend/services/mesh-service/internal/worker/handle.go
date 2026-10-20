package worker

import (
	"context"
	"time"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/storage"
)

// handleOne runs a single delivered job and acks the message on success. A
// failure leaves the message pending in the consumer group — nothing
// reclaims it (see Run's doc comment) — and recovery comes from
// ReconcileMissingArtifacts re-queueing the target as a new job later.
func (w *Worker) handleOne(ctx context.Context, d storage.DeliveredJob) {
	start := time.Now()
	err := w.mesh.ProcessJob(ctx, d.JobID)
	metricConversionSeconds.Observe(time.Since(start).Seconds())
	if err != nil {
		metricConversions.WithLabelValues("failed").Inc()
		w.logger.Error("worker: process failed", "job_id", d.JobID, "msg_id", d.MessageID, "err", err)
		return
	}
	metricConversions.WithLabelValues("succeeded").Inc()
	// Before the ack: the signal is about the job's result, not the stream.
	// ponytail: a failed job sends nothing, so a backfill that keeps failing
	// is retried by the tick only (one per 5 min), never back to back.
	w.signalSucceeded()
	if err := w.queue.AckJob(ctx, d.MessageID); err != nil {
		w.logger.Warn("worker: ack failed", "msg_id", d.MessageID, "err", err)
		return
	}
	w.logger.Info("worker: job done", "job_id", d.JobID)
}

// signalSucceeded never blocks: a full channel already holds a pending signal.
func (w *Worker) signalSucceeded() {
	select {
	case w.succeeded <- struct{}{}:
	default:
	}
}
