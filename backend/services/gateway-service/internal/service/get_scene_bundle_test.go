package service_test

import (
	"context"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *GatewaySuite) TestGetSceneBundle_emptySlug_invalidInput() {
	_, err := s.svc.GetSceneBundle(s.T().Context(), "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *GatewaySuite) TestGetSceneBundle_propagatesProjectNotFound() {
	s.catalog.GetProjectFunc = func(_ context.Context, _ string) (domain.Project, error) {
		return domain.Project{}, domain.ErrProjectNotFound
	}
	s.catalog.ListArtifactsFunc = func(_ context.Context, _ string) ([]domain.Artifact, error) {
		return nil, nil
	}
	s.catalog.ListPlacementsFunc = func(_ context.Context, _ string) ([]domain.Placement, error) {
		return nil, nil
	}
	s.catalog.ListProjectsFunc = func(_ context.Context) ([]domain.Project, error) {
		return nil, nil
	}
	_, err := s.svc.GetSceneBundle(s.T().Context(), "missing")
	assert.ErrorIs(s.T(), err, domain.ErrProjectNotFound)
}

func (s *GatewaySuite) TestGetSceneBundle_artifactMissing_isTolerated() {
	s.catalog.GetProjectFunc = func(_ context.Context, slug string) (domain.Project, error) {
		return domain.Project{Slug: slug, Title: "T"}, nil
	}
	s.catalog.ListArtifactsFunc = func(_ context.Context, _ string) ([]domain.Artifact, error) {
		return nil, nil // no artifacts yet — conversion pending
	}
	s.catalog.ListPlacementsFunc = func(_ context.Context, _ string) ([]domain.Placement, error) {
		return []domain.Placement{}, nil
	}
	s.catalog.ListProjectsFunc = func(_ context.Context) ([]domain.Project, error) {
		return []domain.Project{{Slug: "scene", Title: "Scene"}}, nil
	}
	bundle, err := s.svc.GetSceneBundle(s.T().Context(), "scene")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), bundle.Project.Slug, "scene")
	assert.Assert(s.T(), bundle.Artifact == nil, "expected nil artifact when no LOD0")
	assert.Equal(s.T(), len(bundle.AssetOptions), 1)
	assert.Equal(s.T(), len(bundle.AssetOptions[0].LODs), 0)
}

func (s *GatewaySuite) TestGetSceneBundle_aggregatesLODChain() {
	s.catalog.GetProjectFunc = func(_ context.Context, slug string) (domain.Project, error) {
		return domain.Project{Slug: slug, Title: "Main"}, nil
	}
	s.catalog.ListArtifactsFunc = func(_ context.Context, slug string) ([]domain.Artifact, error) {
		// All projects ship the same three LODs in this test.
		return []domain.Artifact{
			{ProjectSlug: slug, LOD: 2, Hash: "h-" + slug + "-2", Size: 100},
			{ProjectSlug: slug, LOD: 0, Hash: "h-" + slug + "-0", Size: 1000, ContentType: "model/gltf-binary"},
			{ProjectSlug: slug, LOD: 1, Hash: "h-" + slug + "-1", Size: 500},
		}, nil
	}
	s.catalog.ListPlacementsFunc = func(_ context.Context, _ string) ([]domain.Placement, error) {
		return []domain.Placement{
			{ID: 1, ParentSlug: "main", AssetSlug: "asset-a"},
		}, nil
	}
	s.catalog.ListProjectsFunc = func(_ context.Context) ([]domain.Project, error) {
		return []domain.Project{
			{Slug: "main", Title: "Main"},
			{Slug: "asset-a", Title: "Asset A"},
		}, nil
	}
	bundle, err := s.svc.GetSceneBundle(s.T().Context(), "main")
	assert.NilError(s.T(), err)

	// Parent artifact carries LOD0 metadata + full LOD chain ascending.
	assert.Assert(s.T(), bundle.Artifact != nil)
	assert.Equal(s.T(), bundle.Artifact.LOD, uint32(0))
	assert.Equal(s.T(), bundle.Artifact.Hash, "h-main-0")
	assert.Equal(s.T(), len(bundle.Artifact.LODs), 3)
	assert.Equal(s.T(), bundle.Artifact.LODs[0].LOD, uint32(0)) // sorted asc
	assert.Equal(s.T(), bundle.Artifact.LODs[1].LOD, uint32(1))
	assert.Equal(s.T(), bundle.Artifact.LODs[2].LOD, uint32(2))

	// Each asset option carries its own LOD chain.
	assert.Equal(s.T(), len(bundle.AssetOptions), 2)
	for _, o := range bundle.AssetOptions {
		assert.Equal(s.T(), len(o.LODs), 3, "asset %s should have 3 LODs", o.Slug)
		assert.Equal(s.T(), o.LODs[0].LOD, uint32(0))
	}
}
