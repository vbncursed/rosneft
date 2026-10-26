//go:build integration

package storage_test

import (
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"gotest.tools/v3/assert"
)

func (s *ModelTagsSuite) TestCreateModelTagRoundTrip() {
	made, err := s.pg.CreateModelTag(s.T().Context(), "welding", "Welding")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), made.Slug, "welding")
	assert.Equal(s.T(), made.Title, "Welding")
	assert.Assert(s.T(), made.ID > 0)

	tags, err := s.pg.ListModelTags(s.T().Context())
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(tags), 13)
	assert.Equal(s.T(), tags[12].Slug, "welding")
}

func (s *ModelTagsSuite) TestCreateModelTagRefusesATakenSlugOrTitle() {
	for name, c := range map[string][2]string{
		"slug":  {"camp", "Another title"},
		"title": {"fresh", "  flare SYSTEM "},
	} {
		_, err := s.pg.CreateModelTag(s.T().Context(), c[0], c[1])
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput, name)
		assert.ErrorContains(s.T(), err, "already exists", name)
	}
}

func (s *ModelTagsSuite) TestUpdateModelTagRetitlesOnly() {
	out, err := s.pg.UpdateModelTag(s.T().Context(), "camp", "Camps")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Slug, "camp")
	assert.Equal(s.T(), out.Title, "Camps")

	// A model keeps pointing at the same row, so it reads the new title.
	s.create("pump", "camp")
	got, err := s.pg.GetModel(s.T().Context(), "pump")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Tag.Title, "Camps")
}

func (s *ModelTagsSuite) TestUpdateModelTagRefusals() {
	_, err := s.pg.UpdateModelTag(s.T().Context(), "no-such-tag", "X")
	assert.ErrorIs(s.T(), err, domain.ErrModelTagNotFound)

	_, err = s.pg.UpdateModelTag(s.T().Context(), "camp", "Flare system")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.ErrorContains(s.T(), err, "already exists")
}
