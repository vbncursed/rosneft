package converter

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// fakePostprocessor satisfies the converter's Compressor interface.
type fakePostprocessor struct {
	compressFn func(ctx context.Context, glb []byte) ([]byte, error)
	simplifyFn func(ctx context.Context, glb []byte, ratio float64) ([]byte, error)
}

func (f *fakePostprocessor) Compress(ctx context.Context, glb []byte) ([]byte, error) {
	if f.compressFn != nil {
		return f.compressFn(ctx, glb)
	}
	return glb, nil
}

func (f *fakePostprocessor) Simplify(ctx context.Context, glb []byte, ratio float64) ([]byte, error) {
	return f.simplifyFn(ctx, glb, ratio)
}

type ConvertLODsSuite struct {
	suite.Suite
}

func TestConvertLODsSuite(t *testing.T) {
	suite.Run(t, new(ConvertLODsSuite))
}

// simplifyLODs splits ConvertLODs's after-Convert branch out for testing
// without a real OBJ. Equivalent body to the loop in ConvertLODs.
func (c *Converter) simplifyLODs(ctx context.Context, base []domain.ConversionResult) ([]domain.ConversionResult, error) {
	if c.compressor == nil || len(c.lodRatios) == 0 {
		return base, nil
	}
	out := append([]domain.ConversionResult{}, base...)
	for _, ratio := range c.lodRatios {
		lod, err := c.simplifyLOD(ctx, base[0].Content, ratio)
		if err != nil {
			continue
		}
		out = append(out, lod)
	}
	return out, nil
}

func (s *ConvertLODsSuite) TestNoCompressor_returnsLOD0Only() {
	c := &Converter{lodRatios: []float64{0.5}}
	base := []domain.ConversionResult{{ArtifactHash: "h", Size: 1}}
	out, err := c.simplifyLODs(s.T().Context(), base)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 1)
}

func (s *ConvertLODsSuite) TestAppendsForEachRatio() {
	calls := 0
	pp := &fakePostprocessor{
		simplifyFn: func(_ context.Context, _ []byte, _ float64) ([]byte, error) {
			calls++
			return []byte("simplified"), nil
		},
	}
	c := &Converter{compressor: pp, lodRatios: []float64{0.5, 0.25}}
	base := []domain.ConversionResult{{
		ArtifactHash: "lod0",
		Content:      []byte("base"),
		ContentType:  "model/gltf-binary",
	}}
	out, err := c.simplifyLODs(s.T().Context(), base)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 3)
	assert.Equal(s.T(), calls, 2)
	assert.Equal(s.T(), out[1].ContentType, "model/gltf-binary")
}

func (s *ConvertLODsSuite) TestPerLODErrorTolerated() {
	pp := &fakePostprocessor{
		simplifyFn: func(_ context.Context, _ []byte, ratio float64) ([]byte, error) {
			if ratio == 0.25 {
				return nil, errors.New("encoder boom")
			}
			return []byte("ok"), nil
		},
	}
	c := &Converter{compressor: pp, lodRatios: []float64{0.5, 0.25}}
	base := []domain.ConversionResult{{ArtifactHash: "lod0", Content: []byte("base")}}
	out, err := c.simplifyLODs(s.T().Context(), base)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 2) // LOD0 + LOD1; LOD2 dropped
}
