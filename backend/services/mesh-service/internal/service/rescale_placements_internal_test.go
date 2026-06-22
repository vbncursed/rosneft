package service

import (
	"context"
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// stubCatalog is a white-box double recording rescale calls. It implements the
// unexported Catalog interface so the test can exercise rescaleAfterConvert
// directly without driving the full ProcessJob path (which needs a converter).
type stubCatalog struct {
	calls  int
	slug   string
	newMax float64
}

func (s *stubCatalog) GetTarget(context.Context, domain.Kind, string) (domain.ConversionTarget, error) {
	return domain.ConversionTarget{}, nil
}
func (s *stubCatalog) ListTargets(context.Context) ([]domain.ConversionTarget, error) {
	return nil, nil
}
func (s *stubCatalog) HasLOD0(context.Context, domain.Kind, string) (bool, error) { return false, nil }
func (s *stubCatalog) RegisterArtifact(context.Context, domain.Artifact) error    { return nil }
func (s *stubCatalog) RescaleTerritoryPlacements(_ context.Context, slug string, newMax float64) error {
	s.calls++
	s.slug = slug
	s.newMax = newMax
	return nil
}

func TestRescaleAfterConvert(t *testing.T) {
	// LOD0 source bbox with longest axis = 10.
	lod0 := []domain.ConversionResult{{BBoxMax: domain.Vec3{X: 10, Y: 2, Z: 5}}}

	t.Run("territory rescales with the LOD0 max axis", func(t *testing.T) {
		cat := &stubCatalog{}
		m := New(Config{Catalog: cat})
		err := m.rescaleAfterConvert(t.Context(), domain.KindTerritory, "t1", lod0)
		assert.NilError(t, err)
		assert.Equal(t, cat.calls, 1)
		assert.Equal(t, cat.slug, "t1")
		assert.Equal(t, cat.newMax, 10.0)
	})

	t.Run("model does not rescale", func(t *testing.T) {
		cat := &stubCatalog{}
		m := New(Config{Catalog: cat})
		err := m.rescaleAfterConvert(t.Context(), domain.KindModel, "m1", lod0)
		assert.NilError(t, err)
		assert.Equal(t, cat.calls, 0)
	})

	t.Run("degenerate bbox skips rescale", func(t *testing.T) {
		cat := &stubCatalog{}
		m := New(Config{Catalog: cat})
		err := m.rescaleAfterConvert(t.Context(), domain.KindTerritory, "t1", []domain.ConversionResult{{}})
		assert.NilError(t, err)
		assert.Equal(t, cat.calls, 0)
	})
}
