package compression

import (
	"context"
	"os/exec"
	"slices"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type CompressionSuite struct {
	suite.Suite
}

func TestCompressionSuite(t *testing.T) {
	suite.Run(t, new(CompressionSuite))
}

func (s *CompressionSuite) TestCompress_RejectsEmptyInput() {
	d := New("gltfpack")
	_, err := d.Compress(s.T().Context(), nil)
	assert.ErrorContains(s.T(), err, "empty GLB input")
}

func (s *CompressionSuite) TestCompress_FailsWhenBinaryMissing() {
	d := New("gltfpack-does-not-exist-xyz", WithDraco())
	_, err := d.Compress(s.T().Context(), []byte("not-a-real-glb"))
	assert.Assert(s.T(), err != nil)
}

func (s *CompressionSuite) TestAvailable_FailsWhenBinaryMissing() {
	d := New("gltfpack-does-not-exist-xyz")
	err := d.Available(s.T().Context())
	assert.Assert(s.T(), err != nil)
}

func (s *CompressionSuite) TestAvailable_PassesWhenBinaryExists() {
	if _, err := exec.LookPath("gltfpack"); err != nil {
		s.T().Skip("gltfpack not installed; skipping integration check")
	}
	d := New("gltfpack")
	assert.NilError(s.T(), d.Available(s.T().Context()))
}

func (s *CompressionSuite) TestNew_DefaultsBinPath() {
	d := New("")
	assert.Equal(s.T(), d.binPath, "gltfpack")
}

func (s *CompressionSuite) TestCompress_ContextCancelled() {
	d := New("gltfpack-does-not-exist-xyz", WithDraco())
	ctx, cancel := context.WithCancel(s.T().Context())
	cancel()
	_, err := d.Compress(ctx, []byte("payload"))
	assert.Assert(s.T(), err != nil)
}

func (s *CompressionSuite) TestBuildArgs_dracoOnly() {
	o := New("gltfpack", WithDraco())
	args := o.buildArgs("/in", "/out")
	assert.Assert(s.T(), slices.Contains(args, "-cc"))
	assert.Assert(s.T(), !slices.Contains(args, "-tc"))
}

func (s *CompressionSuite) TestBuildArgs_dracoAndKTX2() {
	o := New("gltfpack", WithDraco(), WithKTX2())
	args := o.buildArgs("/in", "/out")
	assert.Assert(s.T(), slices.Contains(args, "-cc"))
	assert.Assert(s.T(), slices.Contains(args, "-tc"))
}

func (s *CompressionSuite) TestHasOptimisations() {
	assert.Assert(s.T(), !New("gltfpack").HasOptimisations())
	assert.Assert(s.T(), New("gltfpack", WithDraco()).HasOptimisations())
	assert.Assert(s.T(), New("gltfpack", WithKTX2()).HasOptimisations())
}

func (s *CompressionSuite) TestSimplify_RejectsEmptyInput() {
	o := New("gltfpack", WithDraco())
	_, err := o.Simplify(s.T().Context(), nil, 0.5)
	assert.ErrorContains(s.T(), err, "empty GLB input")
}

func (s *CompressionSuite) TestSimplify_RejectsBadRatio() {
	o := New("gltfpack", WithDraco())
	_, err := o.Simplify(s.T().Context(), []byte("payload"), 0)
	assert.ErrorContains(s.T(), err, "ratio must be in")
	_, err = o.Simplify(s.T().Context(), []byte("payload"), 1.5)
	assert.ErrorContains(s.T(), err, "ratio must be in")
}
