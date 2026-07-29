package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// Checkpoint seals everything the journal has settled since the last tick and
// appends one chained digest.
//
// The boundary is the PREVIOUS checkpoint's watermark, never the one read now.
// audit_log's sequence hands out ids at INSERT, so an id may exist inside a
// transaction that has not committed and is therefore invisible here. A
// watermark one tick old is past every such id: the transactions alive when it
// was taken have since committed or rolled back. Digesting up to a freshly read
// watermark would cover ids still in flight, and each one landing afterwards
// would look to verify like a forged insertion.
//
// ponytail: the tick interval must exceed the longest write transaction.
// Mutations here are single-statement upserts and the default is 5m, which is
// generous. A longer transaction produces a false alarm from verify, never a
// missed forgery — the failure leans safe. Upgrade path: derive the boundary
// from pg_snapshot_xmin(pg_current_snapshot()) if long write transactions ever
// appear.
//
// The first tick digests nothing. It records where the journal stood so the
// next tick has a boundary, and the seed digest is SHA-256 of the empty string.
func (s *Service) Checkpoint(ctx context.Context) (domain.Checkpoint, error) {
	watermark, err := s.store.SequenceWatermark(ctx)
	if err != nil {
		return domain.Checkpoint{}, err
	}

	prev, ok, err := s.store.LastCheckpoint(ctx)
	if err != nil {
		return domain.Checkpoint{}, err
	}
	if !ok {
		sum := sha256.Sum256(nil)
		return s.store.SaveCheckpoint(ctx, domain.Checkpoint{
			Watermark: watermark,
			Digest:    hex.EncodeToString(sum[:]),
		})
	}

	rowCount, toID, dg, err := s.store.ComputeDigest(ctx, prev.ToID, prev.Watermark, prev.Digest)
	if err != nil {
		return domain.Checkpoint{}, fmt.Errorf("audit.Checkpoint: %w", err)
	}

	return s.store.SaveCheckpoint(ctx, domain.Checkpoint{
		FromID:     prev.ToID,
		ToID:       toID,
		Watermark:  watermark,
		RowCount:   rowCount,
		Digest:     dg,
		PrevDigest: prev.Digest,
	})
}
