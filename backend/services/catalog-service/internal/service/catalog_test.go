package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
)

// fakeRepo is a function-stub Repository. Each test sets only the funcs it
// needs; unset funcs panic, surfacing unexpected calls.
type fakeRepo struct {
	UpsertProjectFunc    func(ctx context.Context, p domain.Project) (domain.Project, error)
	GetProjectFunc       func(ctx context.Context, slug string) (domain.Project, error)
	ListProjectsFunc     func(ctx context.Context) ([]domain.Project, error)
	RegisterArtifactFunc func(ctx context.Context, a domain.Artifact) (domain.Artifact, error)
	GetArtifactFunc      func(ctx context.Context, slug string, lod uint32) (domain.Artifact, error)
	ListArtifactsFunc    func(ctx context.Context, slug string) ([]domain.Artifact, error)

	ListPlacementsFunc  func(ctx context.Context, parentSlug string) ([]domain.Placement, error)
	CreatePlacementFunc func(ctx context.Context, p domain.Placement) (domain.Placement, error)
	UpdatePlacementFunc func(ctx context.Context, p domain.Placement) (domain.Placement, error)
	DeletePlacementFunc func(ctx context.Context, id int64) error
}

func (f *fakeRepo) UpsertProject(ctx context.Context, p domain.Project) (domain.Project, error) {
	return f.UpsertProjectFunc(ctx, p)
}
func (f *fakeRepo) GetProject(ctx context.Context, slug string) (domain.Project, error) {
	return f.GetProjectFunc(ctx, slug)
}
func (f *fakeRepo) ListProjects(ctx context.Context) ([]domain.Project, error) {
	return f.ListProjectsFunc(ctx)
}
func (f *fakeRepo) RegisterArtifact(ctx context.Context, a domain.Artifact) (domain.Artifact, error) {
	return f.RegisterArtifactFunc(ctx, a)
}
func (f *fakeRepo) GetArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error) {
	return f.GetArtifactFunc(ctx, slug, lod)
}
func (f *fakeRepo) ListArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error) {
	return f.ListArtifactsFunc(ctx, slug)
}
func (f *fakeRepo) ListPlacements(ctx context.Context, parentSlug string) ([]domain.Placement, error) {
	return f.ListPlacementsFunc(ctx, parentSlug)
}
func (f *fakeRepo) CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	return f.CreatePlacementFunc(ctx, p)
}
func (f *fakeRepo) UpdatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	return f.UpdatePlacementFunc(ctx, p)
}
func (f *fakeRepo) DeletePlacement(ctx context.Context, id int64) error {
	return f.DeletePlacementFunc(ctx, id)
}

type CatalogSuite struct {
	suite.Suite
	repo *fakeRepo
	svc  *service.Catalog
}

func TestCatalogSuite(t *testing.T) {
	suite.Run(t, new(CatalogSuite))
}

func (s *CatalogSuite) SetupTest() {
	s.repo = &fakeRepo{}
	s.svc = service.New(s.repo)
}

func (s *CatalogSuite) TestUpsertProject_emptySlug_invalidInput() {
	_, err := s.svc.UpsertProject(s.T().Context(), domain.Project{Title: "X", SourceObjPath: "o.obj"})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *CatalogSuite) TestUpsertProject_emptyTitle_invalidInput() {
	_, err := s.svc.UpsertProject(s.T().Context(), domain.Project{Slug: "x", SourceObjPath: "o.obj"})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *CatalogSuite) TestUpsertProject_emptySourceObjPath_invalidInput() {
	_, err := s.svc.UpsertProject(s.T().Context(), domain.Project{Slug: "x", Title: "X"})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *CatalogSuite) TestUpsertProject_valid_callsRepo() {
	called := false
	s.repo.UpsertProjectFunc = func(_ context.Context, p domain.Project) (domain.Project, error) {
		called = true
		return p, nil
	}
	_, err := s.svc.UpsertProject(s.T().Context(), domain.Project{Slug: "x", Title: "X", SourceObjPath: "o.obj"})
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), called)
}

func (s *CatalogSuite) TestUpsertProject_repoError_propagated() {
	s.repo.UpsertProjectFunc = func(_ context.Context, _ domain.Project) (domain.Project, error) {
		return domain.Project{}, errors.New("boom")
	}
	_, err := s.svc.UpsertProject(s.T().Context(), domain.Project{Slug: "x", Title: "X", SourceObjPath: "o.obj"})
	assert.ErrorContains(s.T(), err, "boom")
}

func (s *CatalogSuite) TestGetProject_emptySlug_invalidInput() {
	_, err := s.svc.GetProject(s.T().Context(), "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *CatalogSuite) TestGetProject_repoNotFound_propagated() {
	s.repo.GetProjectFunc = func(_ context.Context, _ string) (domain.Project, error) {
		return domain.Project{}, domain.ErrProjectNotFound
	}
	_, err := s.svc.GetProject(s.T().Context(), "x")
	assert.ErrorIs(s.T(), err, domain.ErrProjectNotFound)
}

func (s *CatalogSuite) TestGetProject_valid_passThrough() {
	s.repo.GetProjectFunc = func(_ context.Context, _ string) (domain.Project, error) {
		return domain.Project{Slug: "x", Title: "T"}, nil
	}
	p, err := s.svc.GetProject(s.T().Context(), "x")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), p.Slug, "x")
}

func (s *CatalogSuite) TestListProjects_passThrough() {
	s.repo.ListProjectsFunc = func(_ context.Context) ([]domain.Project, error) {
		return []domain.Project{{Slug: "x"}, {Slug: "y"}}, nil
	}
	list, err := s.svc.ListProjects(s.T().Context())
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(list), 2)
}

func (s *CatalogSuite) TestRegisterArtifact_validation() {
	cases := map[string]domain.Artifact{
		"empty-slug":         {Hash: "h", ContentType: "x", Size: 1},
		"empty-hash":         {ProjectSlug: "x", ContentType: "x", Size: 1},
		"empty-content-type": {ProjectSlug: "x", Hash: "h", Size: 1},
		"zero-size":          {ProjectSlug: "x", Hash: "h", ContentType: "x"},
		"negative-size":      {ProjectSlug: "x", Hash: "h", ContentType: "x", Size: -1},
	}
	for name, a := range cases {
		s.Run(name, func() {
			_, err := s.svc.RegisterArtifact(s.T().Context(), a)
			assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
		})
	}
}

func (s *CatalogSuite) TestRegisterArtifact_valid_callsRepo() {
	s.repo.RegisterArtifactFunc = func(_ context.Context, a domain.Artifact) (domain.Artifact, error) {
		return a, nil
	}
	a := domain.Artifact{ProjectSlug: "x", Hash: "h", ContentType: "model/gltf-binary", Size: 1024}
	out, err := s.svc.RegisterArtifact(s.T().Context(), a)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Hash, "h")
}

func (s *CatalogSuite) TestRegisterArtifact_repoNotFound_propagated() {
	s.repo.RegisterArtifactFunc = func(_ context.Context, _ domain.Artifact) (domain.Artifact, error) {
		return domain.Artifact{}, domain.ErrProjectNotFound
	}
	_, err := s.svc.RegisterArtifact(s.T().Context(),
		domain.Artifact{ProjectSlug: "x", Hash: "h", ContentType: "x", Size: 1})
	assert.ErrorIs(s.T(), err, domain.ErrProjectNotFound)
}

func (s *CatalogSuite) TestGetArtifact_emptySlug_invalidInput() {
	_, err := s.svc.GetArtifact(s.T().Context(), "", 0)
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *CatalogSuite) TestGetArtifact_repoNotFound_propagated() {
	s.repo.GetArtifactFunc = func(_ context.Context, _ string, _ uint32) (domain.Artifact, error) {
		return domain.Artifact{}, domain.ErrArtifactNotFound
	}
	_, err := s.svc.GetArtifact(s.T().Context(), "x", 0)
	assert.ErrorIs(s.T(), err, domain.ErrArtifactNotFound)
}

func (s *CatalogSuite) TestListArtifacts_emptySlug_invalidInput() {
	_, err := s.svc.ListArtifacts(s.T().Context(), "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *CatalogSuite) TestListArtifacts_passThrough() {
	s.repo.ListArtifactsFunc = func(_ context.Context, _ string) ([]domain.Artifact, error) {
		return []domain.Artifact{{LOD: 0}, {LOD: 1}}, nil
	}
	list, err := s.svc.ListArtifacts(s.T().Context(), "x")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(list), 2)
}

// Placements

func (s *CatalogSuite) TestListPlacements_emptySlug_invalidInput() {
	_, err := s.svc.ListPlacements(s.T().Context(), "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *CatalogSuite) TestListPlacements_passThrough() {
	s.repo.ListPlacementsFunc = func(_ context.Context, _ string) ([]domain.Placement, error) {
		return []domain.Placement{{ID: 1}, {ID: 2}}, nil
	}
	out, err := s.svc.ListPlacements(s.T().Context(), "scene")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 2)
}

func (s *CatalogSuite) TestCreatePlacement_emptySlugs_invalidInput() {
	_, err := s.svc.CreatePlacement(s.T().Context(), domain.Placement{AssetSlug: "asset"})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)

	_, err = s.svc.CreatePlacement(s.T().Context(), domain.Placement{ParentSlug: "parent"})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *CatalogSuite) TestCreatePlacement_selfPlacement_rejected() {
	_, err := s.svc.CreatePlacement(s.T().Context(), domain.Placement{ParentSlug: "x", AssetSlug: "x"})
	assert.ErrorIs(s.T(), err, domain.ErrSelfPlacement)
}

func (s *CatalogSuite) TestCreatePlacement_zeroScale_defaultsToOne() {
	var captured domain.Placement
	s.repo.CreatePlacementFunc = func(_ context.Context, p domain.Placement) (domain.Placement, error) {
		captured = p
		p.ID = 42
		return p, nil
	}
	out, err := s.svc.CreatePlacement(s.T().Context(), domain.Placement{ParentSlug: "scene", AssetSlug: "asset"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.ID, int64(42))
	assert.Equal(s.T(), captured.Scale, domain.Vec3{X: 1, Y: 1, Z: 1})
}

func (s *CatalogSuite) TestCreatePlacement_negativeScaleRejected() {
	_, err := s.svc.CreatePlacement(s.T().Context(), domain.Placement{
		ParentSlug: "scene", AssetSlug: "asset",
		Scale: domain.Vec3{X: 1, Y: -1, Z: 1},
	})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *CatalogSuite) TestUpdatePlacement_zeroIDRejected() {
	_, err := s.svc.UpdatePlacement(s.T().Context(), domain.Placement{Scale: domain.Vec3{X: 1, Y: 1, Z: 1}})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *CatalogSuite) TestUpdatePlacement_passThrough() {
	s.repo.UpdatePlacementFunc = func(_ context.Context, p domain.Placement) (domain.Placement, error) {
		p.ParentSlug = "scene"
		p.AssetSlug = "asset"
		return p, nil
	}
	out, err := s.svc.UpdatePlacement(s.T().Context(), domain.Placement{ID: 7})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.ParentSlug, "scene")
	assert.Equal(s.T(), out.Scale, domain.Vec3{X: 1, Y: 1, Z: 1})
}

func (s *CatalogSuite) TestDeletePlacement_zeroIDRejected() {
	err := s.svc.DeletePlacement(s.T().Context(), 0)
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *CatalogSuite) TestDeletePlacement_notFound_propagates() {
	s.repo.DeletePlacementFunc = func(_ context.Context, _ int64) error {
		return domain.ErrPlacementNotFound
	}
	err := s.svc.DeletePlacement(s.T().Context(), 99)
	assert.ErrorIs(s.T(), err, domain.ErrPlacementNotFound)
}

// silence unused import in case errors becomes unused after edits
var _ = errors.Is
