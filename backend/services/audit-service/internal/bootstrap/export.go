package bootstrap

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/storage"
)

// RunExport writes every entry older than --before to --out as JSON Lines.
//
// It is the manual half of a retention policy whose automatic half does not
// exist on purpose: the journal is kept forever, and this is what an operator
// runs when the growth alert says forever has become expensive. Nothing is
// deleted here — deciding to delete is a separate, deliberate act.
func RunExport(ctx context.Context, cfg config.Config) error {
	logger := InitLogger(cfg)

	if cfg.ExportBefore == "" || cfg.ExportOut == "" {
		return fmt.Errorf("export: --before (RFC3339 or YYYY-MM-DD) and --out are both required")
	}
	before, err := parseCutoff(cfg.ExportBefore)
	if err != nil {
		return err
	}

	pool, err := InitPostgres(ctx, cfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	// O_EXCL: an export that silently appended to, or truncated, an existing
	// archive would corrupt the one copy of history somebody meant to keep.
	f, err := os.OpenFile(cfg.ExportOut, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("export: create %s: %w", cfg.ExportOut, err)
	}
	defer func() { _ = f.Close() }()

	bw := bufio.NewWriter(f)
	enc := json.NewEncoder(bw)
	n := 0
	err = storage.New(pool).ExportBefore(ctx, before, func(e domain.Entry) error {
		n++
		return enc.Encode(e)
	})
	if err != nil {
		return fmt.Errorf("export: %w", err)
	}
	if err := bw.Flush(); err != nil {
		return fmt.Errorf("export: flush: %w", err)
	}

	logger.Info("audit: export complete",
		"entries", n, "before", before.Format(time.RFC3339), "out", cfg.ExportOut)
	return nil
}

// parseCutoff accepts a bare date as well as a full timestamp: an operator
// archiving "everything before March" should not have to remember RFC3339.
//
// A bare date is read in the service's local zone, matching how the journal's
// timestamps are displayed everywhere else in this deployment.
func parseCutoff(s string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	t, err := time.ParseInLocation("2006-01-02", s, time.Local)
	if err != nil {
		return time.Time{}, fmt.Errorf("export: --before must be RFC3339 or YYYY-MM-DD, got %q", s)
	}
	return t, nil
}
