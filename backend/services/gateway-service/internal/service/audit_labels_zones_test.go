package service_test

import (
	"gotest.tools/v3/assert"
)

// A zone belongs to a territory as a placement does: its journal entry names
// that territory. Its tag and calibration rows carry no territory_id and stay
// unnamed rather than guessed.
func (s *AuditLabelsSuite) TestZoneNamesItsTerritory() {
	s.page[0].Entity = "zone"
	s.page[0].Action = "zone.insert"
	s.page[0].NewRow = `{"id":7,"territory_id":5,"title":"Camp"}`
	s.aut.ResolveUserLoginsMock.Return(map[string]string{}, nil)
	s.cat.ResolveTerritorySlugsMock.Return(map[int64]string{5: "tenant-a-scene"}, nil)

	out, err := s.list()

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out[0].TerritorySlug, "tenant-a-scene")
}
