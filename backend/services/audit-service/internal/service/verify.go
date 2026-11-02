package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"slices"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// Verify recomputes the checkpoint chain and, when witnessed is non-nil, checks
// it against the digests recorded outside the database.
//
// The witness is what makes this worth running. Recomputation alone catches a
// careless forger — someone who edited audit_log and left the digests behind.
// It cannot catch one who edited the rows and recomputed the chain, because
// both live in the same database under the same credentials. The file on the
// other volume is the copy they would also have to reach.
//
// A checkpoint the witness has not seen is not a failure: the file is appended
// after the row commits, so the newest checkpoint is legitimately absent for a
// moment, and a witness disabled for part of the journal's life leaves a
// permanent, harmless gap.
//
// The seed checkpoint (the first row) digests no range, but its digest is a
// constant, SHA-256 of the empty string, so it is checked against that and
// against the witness like every other row.
//
// A witness line for a checkpoint the database no longer has is a failure:
// DISABLE TRIGGER plus a delete of the journal's tail and its newest
// checkpoints leaves a self-consistent chain, and the file is then the only
// thing that remembers what was cut. The converse is fine — a witness older
// than the database knows fewer checkpoints. Nothing legitimately removes
// checkpoints (the journal is kept forever; export deletes nothing), so a
// witnessed id that is absent is never explained by retention.
func (s *Service) Verify(ctx context.Context, witnessed map[int64]string) (domain.VerifyResult, error) {
	all, err := s.store.ListCheckpoints(ctx)
	if err != nil {
		return domain.VerifyResult{}, err
	}

	res := domain.VerifyResult{OK: true, Checked: len(all)}
	for i, c := range all {
		var prev *domain.Checkpoint
		if i > 0 {
			prev = &all[i-1]
		}
		reason, err := s.checkpointFailure(ctx, c, prev, witnessed)
		if err != nil {
			return domain.VerifyResult{}, err
		}
		if reason != "" {
			return fail(res, c.ID, reason), nil
		}
	}

	if id, ok := firstMissing(witnessed, all); ok {
		return fail(res, id, fmt.Sprintf(
			"witness records checkpoint %d but the database has no such checkpoint: the journal tail was removed",
			id)), nil
	}
	return res, nil
}

// seedDigest is what Checkpoint stores for the first tick.
func seedDigest() string {
	sum := sha256.Sum256(nil)
	return hex.EncodeToString(sum[:])
}

// firstMissing returns the lowest witnessed checkpoint id absent from all.
func firstMissing(witnessed map[int64]string, all []domain.Checkpoint) (int64, bool) {
	have := make(map[int64]struct{}, len(all))
	for _, c := range all {
		have[c.ID] = struct{}{}
	}
	var missing []int64
	for id := range witnessed {
		if _, ok := have[id]; !ok {
			missing = append(missing, id)
		}
	}
	if len(missing) == 0 {
		return 0, false
	}
	return slices.Min(missing), true
}

// fail stamps the first failure onto the result. Later checkpoints fold this
// one in and would all fail too; reporting them would bury the cause.
func fail(res domain.VerifyResult, id int64, reason string) domain.VerifyResult {
	res.OK = false
	res.FailedID = id
	res.Reason = reason
	return res
}

// checkpointFailure checks one checkpoint: its link to prev (nil for the seed),
// its recomputed digest, then the witness; the first failure's reason wins.
func (s *Service) checkpointFailure(
	ctx context.Context,
	c domain.Checkpoint,
	prev *domain.Checkpoint,
	witnessed map[int64]string,
) (string, error) {
	if prev != nil && c.PrevDigest != prev.Digest {
		return fmt.Sprintf(
			"chain broken: prev_digest %q does not match checkpoint %d digest %q",
			c.PrevDigest, prev.ID, prev.Digest), nil
	}

	got := seedDigest()
	if prev != nil {
		var err error
		_, _, got, err = s.store.ComputeDigest(ctx, c.FromID, c.ToID, c.PrevDigest)
		if err != nil {
			return "", fmt.Errorf("audit.Verify: checkpoint %d: %w", c.ID, err)
		}
	}
	if got != c.Digest {
		return fmt.Sprintf(
			"rows in (%d, %d] no longer digest to %q (got %q)",
			c.FromID, c.ToID, c.Digest, got), nil
	}

	// Keyed by checkpoint id, not to_id: quiet intervals repeat to_id across
	// consecutive checkpoints, so that key would compare a checkpoint against
	// a sibling's digest and fail an untouched journal.
	if w, seen := witnessed[c.ID]; seen && w != c.Digest {
		return fmt.Sprintf(
			"witness disagrees at checkpoint %d: file has %q, database has %q",
			c.ID, w, c.Digest), nil
	}
	return "", nil
}
