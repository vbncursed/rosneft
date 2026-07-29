package bootstrap

import (
	"context"
	"log/slog"
	"time"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/digest"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/service"
)

// RunCheckpointer seals a checkpoint every `every` and witnesses it twice: once
// in the service log under a stable key, once in the JSONL file. It blocks
// until ctx is done; run it in a goroutine.
//
// A zero interval disables checkpointing entirely — useful for a deployment
// that has not provisioned the witness volume yet.
//
// A failed witness write does NOT undo the checkpoint. The chain in Postgres
// stays whole, and a gap in the file is itself detectable by `audit verify
// --digest-file`. Losing the checkpoint instead would break the chain, which is
// the worse of the two.
func RunCheckpointer(
	ctx context.Context, svc *service.Service, w *digest.Writer,
	every time.Duration, logger *slog.Logger,
) {
	if every <= 0 {
		logger.Info("audit: checkpointing disabled")
		return
	}
	logger.Info("audit: checkpointing every", "interval", every.String())

	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			c, err := svc.Checkpoint(ctx)
			if err != nil {
				logger.Error("audit: checkpoint failed", "err", err)
				continue
			}
			logger.Info("audit: checkpoint",
				"from_id", c.FromID, "to_id", c.ToID,
				"row_count", c.RowCount, "digest", c.Digest)
			if err := w.Write(c); err != nil {
				metricDigestWriteFailures.Inc()
				logger.Error("audit: digest witness write failed", "err", err, "checkpoint_id", c.ID)
			}

			// Same tick, same pool: the size gauges cost one extra query every
			// few minutes and need no schedule of their own.
			if rows, bytes, statErr := svc.TableStats(ctx); statErr != nil {
				logger.Warn("audit: table stats unavailable", "err", statErr)
			} else {
				metricJournalRows.Set(float64(rows))
				metricJournalBytes.Set(float64(bytes))
			}
		}
	}
}
