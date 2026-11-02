//go:build integration

package storage_test

import (
	"time"

	"github.com/redis/go-redis/v9"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/storage"
)

// jobTTL is the job hash's TTL: -1 for none, -2 for a missing key.
func (s *TargetIndexSuite) jobTTL(id string) time.Duration {
	d, err := s.rdb.TTL(s.T().Context(), "andrey:mesh:job:"+id).Result()
	assert.NilError(s.T(), err)
	return d
}

// The stream is a work queue, not a log: an acknowledged entry is never read
// again, and XACK alone never removes it. An entry older than any job could
// still be waiting is dropped when the next one is added.
func (s *TargetIndexSuite) TestEnqueueDropsEntriesOlderThanRetention() {
	ctx := s.T().Context()
	assert.NilError(s.T(), s.rdb.Del(ctx, storage.JobsStream).Err())
	_, err := s.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: storage.JobsStream, ID: "1000-0", Values: map[string]any{"job_id": "ancient"},
	}).Result()
	assert.NilError(s.T(), err)

	assert.NilError(s.T(), s.store.EnqueueJob(ctx, "fresh"))

	msgs, err := s.rdb.XRange(ctx, storage.JobsStream, "-", "+").Result()
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(msgs), 1, "the ancient entry should be trimmed")
	assert.Equal(s.T(), msgs[0].Values["job_id"], "fresh")
}

// A job stops being what the index shows when the target's next job is saved;
// it then expires, while the latest job of each target never does.
func (s *TargetIndexSuite) TestSupersededJobExpiresLatestDoesNot() {
	ctx := s.T().Context()
	save := func(id string, st domain.JobStatus) {
		assert.NilError(s.T(), s.store.SaveJob(ctx, domain.Job{
			ID: id, Kind: domain.KindModel, Slug: "retained", Status: st,
		}))
	}
	save("old-1", domain.JobStatusFailed)
	assert.Equal(s.T(), s.jobTTL("old-1"), time.Duration(-1), "the latest job has no expiry")

	save("new-1", domain.JobStatusRunning)
	assert.Assert(s.T(), s.jobTTL("old-1") > 0 && s.jobTTL("old-1") <= storage.JobRetention, "superseded job expires")
	assert.Equal(s.T(), s.jobTTL("new-1"), time.Duration(-1))
	save("new-1", domain.JobStatusSucceeded) // later saves of the latest job keep it
	assert.Equal(s.T(), s.jobTTL("new-1"), time.Duration(-1))

	_, err := s.store.GetJob(ctx, "old-1")
	assert.NilError(s.T(), err, "readable until it expires")
}

func (s *TargetIndexSuite) TestForgottenTargetsJobExpires() {
	ctx := s.T().Context()
	assert.NilError(s.T(), s.store.SaveJob(ctx, domain.Job{
		ID: "gone-1", Kind: domain.KindTerritory, Slug: "gone", Status: domain.JobStatusSucceeded,
	}))
	assert.NilError(s.T(), s.store.ForgetTarget(ctx, domain.KindTerritory, "gone"))
	assert.Assert(s.T(), s.jobTTL("gone-1") > 0 && s.jobTTL("gone-1") <= storage.JobRetention)
}
