package service_test

import (
	"context"
	"strings"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service/mocks"
)

type ModelTagWritesSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Catalog
	ctx  context.Context
}

func TestModelTagWritesSuite(t *testing.T) { suite.Run(t, new(ModelTagWritesSuite)) }

func (s *ModelTagWritesSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo)
	s.ctx = s.T().Context()
}

func (s *ModelTagWritesSuite) TestCreateTrimsTitleAndKeepsSlug() {
	s.repo.CreateModelTagMock.Expect(s.ctx, "welding", "Welding").
		Return(domain.ModelTag{Slug: "welding", Title: "Welding"}, nil)
	got, err := s.svc.CreateModelTag(s.ctx, "welding", "  Welding ")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Slug, "welding")
}

func (s *ModelTagWritesSuite) TestCreateRefusesABadSlugOrTitle() {
	for name, c := range map[string][2]string{
		"empty slug":       {"", "T"},
		"one char":         {"a", "T"},
		"41 chars":         {strings.Repeat("a", 41), "T"},
		"uppercase":        {"Camp", "T"},
		"underscore":       {"a_b", "T"},
		"leading hyphen":   {"-ab", "T"},
		"trailing hyphen":  {"ab-", "T"},
		"double hyphen":    {"a--b", "T"},
		"blank title":      {"ab", "   "},
		"121-char title":   {"ab", strings.Repeat("т", 121)},
		"ungrouped create": {domain.UngroupedTagSlug, "T"},
	} {
		_, err := s.svc.CreateModelTag(s.ctx, c[0], c[1])
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput, name)
	}
}

func (s *ModelTagWritesSuite) TestCreateAcceptsTheBounds() {
	slug := strings.Repeat("a", 40)
	s.repo.CreateModelTagMock.Return(domain.ModelTag{}, nil)
	for _, c := range [][2]string{{"a1", "T"}, {slug, strings.Repeat("т", 120)}, {"a-b-1", "T"}} {
		_, err := s.svc.CreateModelTag(s.ctx, c[0], c[1])
		assert.NilError(s.T(), err, c[0])
	}
}

func (s *ModelTagWritesSuite) TestUpdateTrimsTitle() {
	s.repo.UpdateModelTagMock.Expect(s.ctx, "camp", "Camps").
		Return(domain.ModelTag{Slug: "camp", Title: "Camps"}, nil)
	got, err := s.svc.UpdateModelTag(s.ctx, "camp", " Camps ")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Title, "Camps")
}

func (s *ModelTagWritesSuite) TestUpdateRefusesUngroupedBlankAndEmptySlug() {
	for name, c := range map[string][2]string{
		"ungrouped":   {domain.UngroupedTagSlug, "Other"},
		"blank title": {"camp", " "},
		"empty slug":  {"", "T"},
	} {
		_, err := s.svc.UpdateModelTag(s.ctx, c[0], c[1])
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput, name)
	}
	_, err := s.svc.UpdateModelTag(s.ctx, domain.UngroupedTagSlug, "Other")
	assert.ErrorContains(s.T(), err, "the ungrouped tag cannot be changed")
}
