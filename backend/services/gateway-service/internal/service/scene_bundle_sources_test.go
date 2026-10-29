package service_test

import (
	"errors"
	"fmt"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// sbSource fails one read of the fan-out with err.
type sbSource struct {
	name string
	fail func(s *SceneBundleSuite, err error)
}

// sbTolerant are the reads whose "territory not found" answer is ignored: the
// territory read owns that error.
var sbTolerant = []sbSource{
	{"territory artifacts", func(s *SceneBundleSuite, err error) { s.cat.ListTerritoryArtifactsMock.Return(nil, err) }},
	{"placements", func(s *SceneBundleSuite, err error) { s.cat.ListPlacementsMock.Return(nil, err) }},
	{"measurements", func(s *SceneBundleSuite, err error) { s.cat.ListMeasurementsMock.Return(nil, err) }},
	{"placement groups", func(s *SceneBundleSuite, err error) { s.cat.ListPlacementGroupsMock.Return(nil, err) }},
	{"panoramas", func(s *SceneBundleSuite, err error) { s.con.ListPanoramasMock.Return(nil, err) }},
	{"panorama phases", func(s *SceneBundleSuite, err error) { s.con.ListPanoramaPhasesMock.Return(nil, err) }},
	{"documents", func(s *SceneBundleSuite, err error) { s.con.ListDocumentsMock.Return(nil, err) }},
}

func (s *SceneBundleSuite) TestEverySourceFailureAbortsTheBundle() {
	boom := errors.New("source down")
	all := append([]sbSource{
		{"territory", func(s *SceneBundleSuite, err error) { s.cat.GetTerritoryMock.Return(domain.Territory{}, err) }},
		{"models", func(s *SceneBundleSuite, err error) { s.cat.ListModelsMock.Return(nil, err) }},
	}, sbTolerant...)
	for _, src := range all {
		s.Run(src.name, func() {
			s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
			src.fail(s, boom)

			got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

			assert.Assert(s.T(), errors.Is(err, boom))
			assert.DeepEqual(s.T(), got, domain.SceneBundle{})
		})
	}
}

func (s *SceneBundleSuite) TestTolerantSourcesIgnoreTerritoryNotFound() {
	wrapped := fmt.Errorf("rpc: %w", domain.ErrTerritoryNotFound)
	for _, src := range sbTolerant {
		s.Run(src.name, func() {
			s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
			src.fail(s, wrapped)

			got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

			assert.NilError(s.T(), err)
			assert.Equal(s.T(), got.Territory.Slug, "t1")
		})
	}
}

// Territory and the model catalog do not tolerate not-found.
func (s *SceneBundleSuite) TestModelCatalogNotFoundIsFatal() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.cat.ListModelsMock.Return(nil, domain.ErrTerritoryNotFound)

	_, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.Assert(s.T(), errors.Is(err, domain.ErrTerritoryNotFound))
}

func (s *SceneBundleSuite) TestScopeAndSlugReachTheTerritoryRead() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	s.cat.GetTerritoryMock.Expect(minimock.AnyContext, "t1", "admin-7").
		Return(domain.Territory{Slug: "t1"}, nil)
	s.cat.ListPlacementsMock.Expect(minimock.AnyContext, "t1").Return(nil, nil)
	s.con.ListPanoramasMock.Expect(minimock.AnyContext, "t1").Return(nil, nil)
	s.con.ListDocumentsMock.Expect(minimock.AnyContext, "t1").Return(nil, nil)

	_, err := s.svc.GetSceneBundle(s.ctx, "t1", "admin-7")

	assert.NilError(s.T(), err)
}

func (s *SceneBundleSuite) TestBundleCarriesPanoramasAndDocuments() {
	s.expectFanOut(sbTerr3LOD, sbModelsM1, nil)
	pans := []domain.Panorama{{ID: 3}}
	docs := []domain.Document{{ID: 5}}
	s.con.ListPanoramasMock.Return(pans, nil)
	s.con.ListDocumentsMock.Return(docs, nil)

	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got.Panoramas, pans)
	assert.DeepEqual(s.T(), got.Documents, docs)
}

func (s *SceneBundleSuite) TestPanoramasAndDocumentsAreAlwaysSlices() {
	s.expectFanOut(nil, nil, nil)

	got, err := s.svc.GetSceneBundle(s.ctx, "t1", "")

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got.Panoramas != nil && got.Documents != nil)
	assert.Equal(s.T(), len(got.Panoramas)+len(got.Documents), 0)
}
