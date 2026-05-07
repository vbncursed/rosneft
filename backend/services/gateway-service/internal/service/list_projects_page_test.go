package service_test

import (
	"context"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *GatewaySuite) TestListProjectsPage_noLimit_returnsAll() {
	s.catalog.ListProjectsFunc = func(_ context.Context) ([]domain.Project, error) {
		return []domain.Project{
			{Slug: "b"}, {Slug: "a"}, {Slug: "c"},
		}, nil
	}
	page, err := s.svc.ListProjectsPage(s.T().Context(), 0, "")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(page.Items), 3)
	assert.Equal(s.T(), page.Items[0].Slug, "a") // sorted
	assert.Equal(s.T(), page.NextCursor, "")
}

func (s *GatewaySuite) TestListProjectsPage_emitsCursorWhenMore() {
	s.catalog.ListProjectsFunc = func(_ context.Context) ([]domain.Project, error) {
		return []domain.Project{
			{Slug: "a"}, {Slug: "b"}, {Slug: "c"}, {Slug: "d"},
		}, nil
	}
	page, err := s.svc.ListProjectsPage(s.T().Context(), 2, "")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(page.Items), 2)
	assert.Equal(s.T(), page.Items[0].Slug, "a")
	assert.Equal(s.T(), page.Items[1].Slug, "b")
	assert.Equal(s.T(), page.NextCursor, "b")
}

func (s *GatewaySuite) TestListProjectsPage_cursorAdvances() {
	s.catalog.ListProjectsFunc = func(_ context.Context) ([]domain.Project, error) {
		return []domain.Project{
			{Slug: "a"}, {Slug: "b"}, {Slug: "c"}, {Slug: "d"},
		}, nil
	}
	page, err := s.svc.ListProjectsPage(s.T().Context(), 2, "b")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(page.Items), 2)
	assert.Equal(s.T(), page.Items[0].Slug, "c")
	assert.Equal(s.T(), page.Items[1].Slug, "d")
	assert.Equal(s.T(), page.NextCursor, "") // last page, no more
}

func (s *GatewaySuite) TestListProjectsPage_negativeLimit_invalidInput() {
	_, err := s.svc.ListProjectsPage(s.T().Context(), -1, "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *GatewaySuite) TestListProjectsPage_excessiveLimit_invalidInput() {
	_, err := s.svc.ListProjectsPage(s.T().Context(), 10_000, "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}
