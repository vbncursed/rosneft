package service

import (
	"context"
	"fmt"

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
// The seed checkpoint (the first row, which digests nothing) is walked for its
// link but not recomputed — there is no range under it.
func (s *Service) Verify(ctx context.Context, witnessed map[int64]string) (domain.VerifyResult, error) {
	all, err := s.store.ListCheckpoints(ctx)
	if err != nil {
		return domain.VerifyResult{}, err
	}

	res := domain.VerifyResult{OK: true, Checked: len(all)}
	for i, c := range all {
		if i > 0 && c.PrevDigest != all[i-1].Digest {
			return fail(res, c.ID, fmt.Sprintf(
				"chain broken: prev_digest %q does not match checkpoint %d digest %q",
				c.PrevDigest, all[i-1].ID, all[i-1].Digest)), nil
		}
		if i == 0 {
			continue
		}

		_, _, got, err := s.store.ComputeDigest(ctx, c.FromID, c.ToID, c.PrevDigest)
		if err != nil {
			return domain.VerifyResult{}, fmt.Errorf("audit.Verify: checkpoint %d: %w", c.ID, err)
		}
		if got != c.Digest {
			return fail(res, c.ID, fmt.Sprintf(
				"rows in (%d, %d] no longer digest to %q (got %q)",
				c.FromID, c.ToID, c.Digest, got)), nil
		}

		if witnessed == nil {
			continue
		}
		// Keyed by checkpoint id, not to_id: quiet intervals repeat to_id across
		// consecutive checkpoints, so that key would compare a checkpoint against
		// a sibling's digest and fail an untouched journal.
		if w, seen := witnessed[c.ID]; seen && w != c.Digest {
			return fail(res, c.ID, fmt.Sprintf(
				"witness disagrees at checkpoint %d: file has %q, database has %q",
				c.ID, w, c.Digest)), nil
		}
	}
	return res, nil
}

// fail stamps the first failure onto the result. Later checkpoints fold this
// one in and would all fail too; reporting them would bury the cause.
func fail(res domain.VerifyResult, id int64, reason string) domain.VerifyResult {
	res.OK = false
	res.FailedID = id
	res.Reason = reason
	return res
}
