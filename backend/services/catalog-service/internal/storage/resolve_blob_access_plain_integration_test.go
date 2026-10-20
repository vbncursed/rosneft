//go:build integration

package storage_test

import "gotest.tools/v3/assert"

// A plain GLB is reachable exactly when the LOD0 it was made from is: the model
// branch is open to everyone, the territory branch keeps the scope filter.
func (s *BlobAccessSuite) TestPlainCopyFollowsItsLOD0() {
	assert.Assert(s.T(), s.allowed("hash-plain-a", s.adminA))
	assert.Assert(s.T(), !s.allowed("hash-plain-a", s.adminB))
	assert.Assert(s.T(), s.allowed("hash-plain-a", ""))

	assert.Assert(s.T(), s.allowed("hash-plain-model", s.adminB))
}

// A mapping whose LOD0 hash no artifact row holds any more (reconverted by the
// old release, or deleted) grants nobody the plain blob, Root included.
func (s *BlobAccessSuite) TestStaleMappingGrantsNothing() {
	assert.Assert(s.T(), !s.allowed("hash-plain-gone", s.adminA))
	assert.Assert(s.T(), !s.allowed("hash-plain-gone", ""))
}
