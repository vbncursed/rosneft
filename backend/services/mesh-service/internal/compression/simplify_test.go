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
	o := New("gltfpack", WithDraco(), WithKTX2())

	args := o.simplifyArgs("in.glb", "out.glb", 0.25)

	assert.Equal(s.T(), argValue(args, "-si"), "0.25")
	assert.Equal(s.T(), argValue(args, "-ts"), "0.25")
}

func (s *SimplifyArgsSuite) TestKeepsTheBaseFlags() {
	o := New("gltfpack", WithDraco(), WithKTX2())

	args := o.simplifyArgs("in.glb", "out.glb", 0.5)

	// -tc is what makes -ts take effect: gltfpack resizes textures while
	// encoding them, so a build without KTX2 silently ignores the scale.
	for _, want := range []string{"-noq", "-kn", "-km", "-ke", "-cc", "-tc"} {
		assert.Assert(s.T(), slices.Contains(args, want), "missing %s", want)
	}
	assert.Equal(s.T(), argValue(args, "-i"), "in.glb")
	assert.Equal(s.T(), argValue(args, "-o"), "out.glb")
}
