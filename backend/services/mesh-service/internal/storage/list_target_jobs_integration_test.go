//go:build integration

package storage_test

import (
	"context"
	"testing"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/storage"
)

// TargetIndexSuite runs against a real Redis: the pipeline that writes the job
// hash and its index entry together, and the pipelined read behind
// ListTargetJobs, are storage behaviour a mock cannot prove.
type TargetIndexSuite struct {
	suite.Suite
	ctr   *tcredis.RedisContainer
	store *storage.Redis
}

func TestTargetIndexSuite(t *testing.T) { suite.Run(t, new(TargetIndexSuite)) }

func (s *TargetIndexSuite) SetupSuite() {
	ctx := context.Background()
	// redis:8.10.1 — docker-compose.yml's pin.
	ctr, err := tcredis.Run(ctx, "redis:8.10.1")
	assert.NilError(s.T(), err)
	s.ctr = ctr
	uri, err := ctr.ConnectionString(ctx)
	assert.NilError(s.T(), err)
	opts, err := redis.ParseURL(uri)
	assert.NilError(s.T(), err)
	s.store, err = storage.New(ctx, redis.NewClient(opts))
	assert.NilError(s.T(), err)
}

func (s *TargetIndexSuite) TearDownSuite() {
	assert.NilError(s.T(), testcontainers.TerminateContainer(s.ctr))
}

func (s *TargetIndexSuite) TestLatestJobPerTargetInKindThenSlugOrder() {
	ctx := s.T().Context()
	save := func(j domain.Job) { assert.NilError(s.T(), s.store.SaveJob(ctx, j)) }
	save(domain.Job{ID: "m-old", Kind: domain.KindModel, Slug: "pump", Status: domain.JobStatusFailed})
	save(domain.Job{ID: "t-1", Kind: domain.KindTerritory, Slug: "yard", Status: domain.JobStatusRunning, Progress: 0.4, Stage: "parsing"})
	save(domain.Job{ID: "m-new", Kind: domain.KindModel, Slug: "pump", Status: domain.JobStatusPending})
	save(domain.Job{ID: "t-2", Kind: domain.KindTerritory, Slug: "block", Status: domain.JobStatusSucceeded})

	got, err := s.store.ListTargetJobs(ctx)
	assert.NilError(s.T(), err)

	ids := make([]string, len(got))
	for i, j := range got {
		ids[i] = j.ID
	}
	// Territories before models, slugs alphabetical, and pump's older job is gone.
	assert.DeepEqual(s.T(), ids, []string{"t-2", "t-1", "m-new"})
	assert.Equal(s.T(), got[1].Stage, "parsing")
	assert.Equal(s.T(), got[1].Progress, float32(0.4))

	// The superseded job is still readable by id: the index moved, the hash stayed.
	old, err := s.store.GetJob(ctx, "m-old")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), old.Status, domain.JobStatusFailed)
}

func (s *TargetIndexSuite) TestForgetTargetDropsTheEntryAndKeepsTheJob() {
	ctx := s.T().Context()
	assert.NilError(s.T(), s.store.SaveJob(ctx, domain.Job{ID: "gone-1", Kind: domain.KindTerritory, Slug: "gone", Status: domain.JobStatusFailed}))

	assert.NilError(s.T(), s.store.ForgetTarget(ctx, domain.KindTerritory, "gone"))
	// Idempotent: a second sweep, or another replica's, finds nothing to drop.
	assert.NilError(s.T(), s.store.ForgetTarget(ctx, domain.KindTerritory, "gone"))

	got, err := s.store.ListTargetJobs(ctx)
	assert.NilError(s.T(), err)
	for _, j := range got {
		assert.Assert(s.T(), j.Slug != "gone", "index still lists the forgotten target")
	}
	old, err := s.store.GetJob(ctx, "gone-1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), old.Status, domain.JobStatusFailed)
}
