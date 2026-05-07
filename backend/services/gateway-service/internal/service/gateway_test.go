package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
)

type fakeCatalog struct {
	ListProjectsFunc  func(ctx context.Context) ([]domain.Project, error)
	GetProjectFunc    func(ctx context.Context, slug string) (domain.Project, error)
	ListArtifactsFunc func(ctx context.Context, slug string) ([]domain.Artifact, error)
	GetArtifactFunc   func(ctx context.Context, slug string, lod uint32) (domain.Artifact, error)

	ListPlacementsFunc  func(ctx context.Context, parentSlug string) ([]domain.Placement, error)
	CreatePlacementFunc func(ctx context.Context, p domain.Placement) (domain.Placement, error)
	UpdatePlacementFunc func(ctx context.Context, p domain.Placement) (domain.Placement, error)
	DeletePlacementFunc func(ctx context.Context, id int64) error
}

func (f *fakeCatalog) ListProjects(ctx context.Context) ([]domain.Project, error) {
	return f.ListProjectsFunc(ctx)
}
func (f *fakeCatalog) GetProject(ctx context.Context, slug string) (domain.Project, error) {
	return f.GetProjectFunc(ctx, slug)
}
func (f *fakeCatalog) ListArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error) {
	return f.ListArtifactsFunc(ctx, slug)
}
func (f *fakeCatalog) GetArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error) {
	return f.GetArtifactFunc(ctx, slug, lod)
}
func (f *fakeCatalog) ListPlacements(ctx context.Context, parentSlug string) ([]domain.Placement, error) {
	return f.ListPlacementsFunc(ctx, parentSlug)
}
func (f *fakeCatalog) CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	return f.CreatePlacementFunc(ctx, p)
}
func (f *fakeCatalog) UpdatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	return f.UpdatePlacementFunc(ctx, p)
}
func (f *fakeCatalog) DeletePlacement(ctx context.Context, id int64) error {
	return f.DeletePlacementFunc(ctx, id)
}

type fakeMesh struct {
	SubmitConversionFunc func(ctx context.Context, slug string) (domain.Job, error)
	GetJobFunc           func(ctx context.Context, id string) (domain.Job, error)
}

func (f *fakeMesh) SubmitConversion(ctx context.Context, slug string) (domain.Job, error) {
	return f.SubmitConversionFunc(ctx, slug)
}
func (f *fakeMesh) GetJob(ctx context.Context, id string) (domain.Job, error) {
	return f.GetJobFunc(ctx, id)
}

type GatewaySuite struct {
	suite.Suite
	catalog *fakeCatalog
	mesh    *fakeMesh
	svc     *service.Gateway
}

func TestGatewaySuite(t *testing.T) {
	suite.Run(t, new(GatewaySuite))
}

func (s *GatewaySuite) SetupTest() {
	s.catalog = &fakeCatalog{}
	s.mesh = &fakeMesh{}
	s.svc = service.New(s.catalog, s.mesh)
}

func (s *GatewaySuite) TestListProjects_passThrough() {
	s.catalog.ListProjectsFunc = func(_ context.Context) ([]domain.Project, error) {
		return []domain.Project{{Slug: "a"}, {Slug: "b"}}, nil
	}
	out, err := s.svc.ListProjects(s.T().Context())
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 2)
}

func (s *GatewaySuite) TestGetProject_emptySlug_invalidInput() {
	_, err := s.svc.GetProject(s.T().Context(), "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *GatewaySuite) TestGetProject_propagatesNotFound() {
	s.catalog.GetProjectFunc = func(_ context.Context, _ string) (domain.Project, error) {
		return domain.Project{}, domain.ErrProjectNotFound
	}
	_, err := s.svc.GetProject(s.T().Context(), "x")
	assert.ErrorIs(s.T(), err, domain.ErrProjectNotFound)
}

func (s *GatewaySuite) TestListArtifacts_emptySlug_invalidInput() {
	_, err := s.svc.ListArtifacts(s.T().Context(), "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *GatewaySuite) TestGetArtifact_emptySlug_invalidInput() {
	_, err := s.svc.GetArtifact(s.T().Context(), "", 0)
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *GatewaySuite) TestGetArtifact_propagatesNotFound() {
	s.catalog.GetArtifactFunc = func(_ context.Context, _ string, _ uint32) (domain.Artifact, error) {
		return domain.Artifact{}, domain.ErrArtifactNotFound
	}
	_, err := s.svc.GetArtifact(s.T().Context(), "x", 0)
	assert.ErrorIs(s.T(), err, domain.ErrArtifactNotFound)
}

func (s *GatewaySuite) TestSubmitConversion_emptySlug_invalidInput() {
	_, err := s.svc.SubmitConversion(s.T().Context(), "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *GatewaySuite) TestSubmitConversion_callsMesh() {
	called := false
	s.mesh.SubmitConversionFunc = func(_ context.Context, slug string) (domain.Job, error) {
		called = true
		return domain.Job{ID: "j1", ProjectSlug: slug, Status: domain.JobStatusPending}, nil
	}
	job, err := s.svc.SubmitConversion(s.T().Context(), "x")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), called)
	assert.Equal(s.T(), job.ID, "j1")
}

func (s *GatewaySuite) TestGetJob_emptyID_invalidInput() {
	_, err := s.svc.GetJob(s.T().Context(), "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *GatewaySuite) TestGetJob_propagatesNotFound() {
	s.mesh.GetJobFunc = func(_ context.Context, _ string) (domain.Job, error) {
		return domain.Job{}, domain.ErrJobNotFound
	}
	_, err := s.svc.GetJob(s.T().Context(), "j1")
	assert.ErrorIs(s.T(), err, domain.ErrJobNotFound)
}

func (s *GatewaySuite) TestListProjects_propagatesError() {
	s.catalog.ListProjectsFunc = func(_ context.Context) ([]domain.Project, error) {
		return nil, errors.New("upstream boom")
	}
	_, err := s.svc.ListProjects(s.T().Context())
	assert.ErrorContains(s.T(), err, "upstream boom")
}
