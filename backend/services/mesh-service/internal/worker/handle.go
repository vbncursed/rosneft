package worker

import (
	"context"
	"time"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/storage"
)

// handleOne runs a single delivered job and acks the message on success.
// Failures stay un-acked so the message can be reclaimed.
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
	if err := w.queue.AckJob(ctx, d.MessageID); err != nil {
		w.logger.Warn("worker: ack failed", "msg_id", d.MessageID, "err", err)
		return
	}
	w.logger.Info("worker: job done", "job_id", d.JobID)
}
