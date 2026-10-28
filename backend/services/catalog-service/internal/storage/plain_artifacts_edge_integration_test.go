//go:build integration

package storage_test

import (
	"fmt"
	"sync"

	"gotest.tools/v3/assert"
)

// A tiny mesh can simplify to itself, so LOD1 may carry LOD0's exact bytes and
// hash. The mapping belongs to LOD0 only: LOD1 must still read no plain.
func (s *PlainArtifactsSuite) TestLowerLODWithLOD0BytesReadsNoPlain() {
	ctx := s.T().Context()
	s.seedTerritory("t")
	_, err := s.pg.RegisterTerritoryArtifact(ctx, art("t", 0, "same", "p"))
	assert.NilError(s.T(), err)
	_, err = s.pg.RegisterTerritoryArtifact(ctx, art("t", 1, "same", ""))
	assert.NilError(s.T(), err)

	chain, err := s.pg.ListTerritoryArtifacts(ctx, "t")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), plains(chain), []string{"p", ""})
	one, err := s.pg.GetTerritoryArtifact(ctx, "t", 1)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), one.PlainHash, "")
}

// Two owners registering one LOD0 hash at once upsert one mapping row: no
// unique violation, no deadlock, and both owners read the same plain.
func (s *PlainArtifactsSuite) TestConcurrentRegistersOfOneLOD0LeaveOneRow() {
	ctx := s.T().Context()
	s.seedTerritory("t1")
	s.seedTerritory("t2")
	const rounds = 20
	errs := make(chan error, 2*rounds)
	var wg sync.WaitGroup
	for i := range rounds {
		for _, slug := range []string{"t1", "t2"} {
			wg.Go(func() {
				_, err := s.pg.RegisterTerritoryArtifact(ctx, art(slug, 0, "shared", fmt.Sprintf("p-%s-%d", slug, i)))
				errs <- err
			})
		}
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		assert.NilError(s.T(), err)
	}

	var n int
	assert.NilError(
		s.T(),
		s.pool.QueryRow(ctx, `SELECT count(*) FROM plain_artifacts WHERE lod0_hash = 'shared'`).Scan(&n),
	)
	assert.Equal(s.T(), n, 1)
	a1, err := s.pg.GetTerritoryArtifact(ctx, "t1", 0)
	assert.NilError(s.T(), err)
	a2, err := s.pg.GetTerritoryArtifact(ctx, "t2", 0)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), a1.PlainHash, a2.PlainHash)
}

// A mapping keyed by a hash that only a lower LOD holds grants nothing, owner
// and Root included: the plain branches follow LOD0 rows, never LOD1.
func (s *BlobAccessSuite) TestPlainNeverFollowsALowerLOD() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx,
		`INSERT INTO territory_artifacts
		 (territory_id, lod, hash, content_type, size_bytes, vertices, faces,
		  bbox_min_x,bbox_min_y,bbox_min_z,bbox_max_x,bbox_max_y,bbox_max_z)
		 VALUES ($1,1,'hash-lod1-a','model/gltf-binary',1,1,1,0,0,0,1,1,1)`, s.terrA)
	assert.NilError(s.T(), err)
	_, err = s.pool.Exec(ctx,
		`INSERT INTO plain_artifacts (lod0_hash, plain_hash) VALUES ('hash-lod1-a','hash-plain-lod1')`)
	assert.NilError(s.T(), err)

	assert.Assert(s.T(), !s.allowed("hash-plain-lod1", s.adminA))
	assert.Assert(s.T(), !s.allowed("hash-plain-lod1", ""))
}
