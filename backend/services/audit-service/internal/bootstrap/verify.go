package bootstrap

import (
	"context"
	"errors"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/digest"
)

// ErrJournalTampered is returned when the chain does not reproduce. main maps
// it to a non-zero exit status so a cron or a CI step notices without parsing
// output.
var ErrJournalTampered = errors.New("audit journal failed verification")

// RunVerify recomputes the checkpoint chain, optionally against the witness
// file named by AUDIT_DIGEST_FILE.
func RunVerify(ctx context.Context, cfg config.Config) error {
	logger := InitLogger(cfg)

	pool, err := InitPostgres(ctx, cfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	var witnessed map[int64]string
	if cfg.DigestFile != "" {
		witnessed, err = digest.ReadFile(cfg.DigestFile)
		if err != nil {
			return err
		}
		logger.Info("audit: witness loaded", "path", cfg.DigestFile, "lines", len(witnessed))
	} else {
		logger.Warn("audit: no witness file configured; recomputation alone cannot catch a forger who also recomputed the chain")
	}

	_, _, svc := InitService(pool)
	res, err := svc.Verify(ctx, witnessed)
	if err != nil {
		return err
	}
	if !res.OK {
		logger.Error("audit: verification failed",
			"checkpoint_id", res.FailedID, "reason", res.Reason, "checked", res.Checked)
		return fmt.Errorf("%w: checkpoint %d: %s", ErrJournalTampered, res.FailedID, res.Reason)
	}
	logger.Info("audit: verification passed", "checkpoints", res.Checked)
	return nil
}
