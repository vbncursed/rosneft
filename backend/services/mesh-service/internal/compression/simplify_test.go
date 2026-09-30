package compression

import (
	"slices"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type SimplifyArgsSuite struct {
	suite.Suite
}

func TestSimplifyArgsSuite(t *testing.T) {
	suite.Run(t, new(SimplifyArgsSuite))
}

// argValue returns the token following flag, or "" when the flag is absent.
func argValue(args []string, flag string) string {
	i := slices.Index(args, flag)
	if i < 0 || i+1 >= len(args) {
		return ""
	}
	return args[i+1]
}

func (s *SimplifyArgsSuite) TestScalesTexturesByTheSameRatio() {
	o := New("gltfpack", WithMeshopt(), WithKTX2(0))

	args := o.simplifyArgs("in.glb", "out.glb", 0.25)

	assert.Equal(s.T(), argValue(args, "-si"), "0.25")
	assert.Equal(s.T(), argValue(args, "-ts"), "0.25")
}

func (s *SimplifyArgsSuite) TestKeepsTheBaseFlags() {
	o := New("gltfpack", WithMeshopt(), WithKTX2(0))

	args := o.simplifyArgs("in.glb", "out.glb", 0.5)

	// -tc is what makes -ts take effect: gltfpack resizes textures while
	// encoding them, so a build without KTX2 silently ignores the scale.
	for _, want := range []string{"-noq", "-kn", "-km", "-ke", "-cc", "-tc"} {
		assert.Assert(s.T(), slices.Contains(args, want), "missing %s", want)
	}
	assert.Equal(s.T(), argValue(args, "-i"), "in.glb")
	assert.Equal(s.T(), argValue(args, "-o"), "out.glb")
}

// gltfpack applies -ts and then clamps to -tl, so an unscaled cap flattens
// every LOD of an oversized source: 16384² at -ts 0.5 is 8192, which an
// 8192 cap leaves alone — LOD1 would ship LOD0's textures.
func (s *SimplifyArgsSuite) TestScalesTheTextureCapWithTheLOD() {
	o := New("gltfpack", WithKTX2(8192))

	assert.Equal(s.T(), argValue(o.simplifyArgs("in.glb", "out.glb", 0.5), "-tl"), "4096")
	assert.Equal(s.T(), argValue(o.simplifyArgs("in.glb", "out.glb", 0.25), "-tl"), "2048")
}

func (s *SimplifyArgsSuite) TestPassesTheTextureCapOnce() {
	args := New("gltfpack", WithKTX2(8192)).simplifyArgs("in.glb", "out.glb", 0.5)

	count := 0
	for _, a := range args {
		if a == "-tl" {
			count++
		}
	}
	assert.Equal(s.T(), count, 1)
}
