package compression

import (
	"slices"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type BuildArgsSuite struct {
	suite.Suite
}

func TestBuildArgsSuite(t *testing.T) {
	suite.Run(t, new(BuildArgsSuite))
}

// Without -tj gltfpack encodes every texture at once on every core, and one
// 8192² texture alone peaks near 3.5 GB — three of them OOM-killed the worker.
func (s *BuildArgsSuite) TestEncodesOneTextureAtATime() {
	args := New("gltfpack", WithKTX2(0)).buildArgs("in.glb", "out.glb")

	assert.Equal(s.T(), argValue(args, "-tj"), "1")
}

func (s *BuildArgsSuite) TestCapsTheTextureSide() {
	args := New("gltfpack", WithKTX2(8192)).buildArgs("in.glb", "out.glb")

	assert.Equal(s.T(), argValue(args, "-tl"), "8192")
}

func (s *BuildArgsSuite) TestZeroLeavesTheTextureSideUncapped() {
	args := New("gltfpack", WithKTX2(0)).buildArgs("in.glb", "out.glb")

	assert.Assert(s.T(), !slices.Contains(args, "-tl"))
}

func (s *BuildArgsSuite) TestNoTextureFlagsWithoutKTX2() {
	args := New("gltfpack", WithMeshopt()).buildArgs("in.glb", "out.glb")

	for _, flag := range []string{"-tc", "-tj", "-tl"} {
		assert.Assert(s.T(), !slices.Contains(args, flag), "unexpected %s", flag)
	}
}
