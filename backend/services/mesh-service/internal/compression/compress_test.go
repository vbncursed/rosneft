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

// Without -tj gltfpack encodes every texture at once on every core: three
// 8192² textures grew past 6.7 GB and were OOM-killed; with -tj 1, 4.0 GB.
func (s *BuildArgsSuite) TestEncodesOneTextureAtATime() {
	args := New("gltfpack", WithKTX2(0)).buildArgs("in.glb", "out.glb", 1)

	assert.Equal(s.T(), argValue(args, "-tj"), "1")
}

func (s *BuildArgsSuite) TestCapsTheTextureSide() {
	args := New("gltfpack", WithKTX2(8192)).buildArgs("in.glb", "out.glb", 1)

	assert.Equal(s.T(), argValue(args, "-tl"), "8192")
}

func (s *BuildArgsSuite) TestZeroLeavesTheTextureSideUncapped() {
	args := New("gltfpack", WithKTX2(0)).buildArgs("in.glb", "out.glb", 1)

	assert.Assert(s.T(), !slices.Contains(args, "-tl"))
}

func (s *BuildArgsSuite) TestNoTextureFlagsWithoutKTX2() {
	args := New("gltfpack", WithMeshopt()).buildArgs("in.glb", "out.glb", 1)

	for _, flag := range []string{"-tc", "-tj", "-tl"} {
		assert.Assert(s.T(), !slices.Contains(args, flag), "unexpected %s", flag)
	}
}
