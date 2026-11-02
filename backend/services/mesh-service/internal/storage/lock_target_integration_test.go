//go:build integration

package storage_test

import (
	"time"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// A worker whose claim lapsed must not be able to release the claim a later
// owner holds: the lapse is exactly when another submitter takes the key.
func (s *TargetIndexSuite) TestUnlockByLapsedOwnerKeepsNewOwnersClaim() {
	ctx := s.T().Context()
	kind, slug := domain.KindTerritory, "lapse"

	ok, err := s.store.TryLockTarget(ctx, kind, slug, "job-a", 100*time.Millisecond)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), ok)
	time.Sleep(200 * time.Millisecond) // A's TTL lapses.

	ok, err = s.store.TryLockTarget(ctx, kind, slug, "job-b", time.Minute)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), ok, "B takes the lapsed claim")

	// A, still running, finishes and unlocks.
	assert.NilError(s.T(), s.store.UnlockTarget(ctx, kind, slug, "job-a"))

	ok, err = s.store.TryLockTarget(ctx, kind, slug, "job-c", time.Minute)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !ok, "B's claim must survive A's unlock")
}

func (s *TargetIndexSuite) TestOwnerUnlocksItsClaimAndHoldTakesOver() {
	ctx := s.T().Context()
	kind, slug := domain.KindModel, "owner"

	ok, err := s.store.TryLockTarget(ctx, kind, slug, "job-a", time.Minute)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), ok)

	// The job starting (markRunning) takes the claim whoever held it...
	assert.NilError(s.T(), s.store.HoldTarget(ctx, kind, slug, "job-b", time.Minute))
	// ...so the previous owner's unlock no longer matches.
	assert.NilError(s.T(), s.store.UnlockTarget(ctx, kind, slug, "job-a"))
	ok, err = s.store.TryLockTarget(ctx, kind, slug, "job-c", time.Minute)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !ok, "B holds the claim")

	assert.NilError(s.T(), s.store.UnlockTarget(ctx, kind, slug, "job-b"))
	ok, err = s.store.TryLockTarget(ctx, kind, slug, "job-c", time.Minute)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), ok, "the owner's unlock frees the target")
}
