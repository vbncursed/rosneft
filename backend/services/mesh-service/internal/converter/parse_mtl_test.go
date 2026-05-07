package converter

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type ParseMTLSuite struct{ suite.Suite }

func TestParseMTLSuite(t *testing.T) { suite.Run(t, new(ParseMTLSuite)) }

func (s *ParseMTLSuite) TestSingleMaterial() {
	mtl := `# header
newmtl Solid
Ka 0 0 0
Kd 0.5 0.5 0.5
Ks 0.0 0.0 0.0
d 0.8
map_Kd image.jpg
`
	mats, err := parseMTL(strings.NewReader(mtl))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(mats), 1)
	assert.Equal(s.T(), mats[0].name, "Solid")
	assert.Equal(s.T(), mats[0].kd, [3]float32{0.5, 0.5, 0.5})
	assert.Equal(s.T(), mats[0].alpha, float32(0.8))
	assert.Equal(s.T(), mats[0].diffuseMap, "image.jpg")
}

func (s *ParseMTLSuite) TestMultipleMaterialsAndDefaults() {
	mtl := `newmtl A
Kd 1 0 0

newmtl B
Tr 0.25
map_Kd folder with spaces/tex.png
`
	mats, err := parseMTL(strings.NewReader(mtl))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(mats), 2)

	assert.Equal(s.T(), mats[0].name, "A")
	assert.Equal(s.T(), mats[0].kd, [3]float32{1, 0, 0})
	assert.Equal(s.T(), mats[0].alpha, float32(1)) // default
	assert.Equal(s.T(), mats[0].diffuseMap, "")

	assert.Equal(s.T(), mats[1].name, "B")
	assert.Equal(s.T(), mats[1].kd, [3]float32{1, 1, 1}) // default white
	assert.Equal(s.T(), mats[1].alpha, float32(0.75))    // 1 - Tr
	assert.Equal(s.T(), mats[1].diffuseMap, "folder with spaces/tex.png")
}

func (s *ParseMTLSuite) TestMapKdStripsOptions() {
	mtl := "newmtl X\nmap_Kd -clamp on -s 1 1 1 image.jpg\n"
	mats, err := parseMTL(strings.NewReader(mtl))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), mats[0].diffuseMap, "image.jpg")
}

func (s *ParseMTLSuite) TestEmpty() {
	mats, err := parseMTL(strings.NewReader(""))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(mats), 0)
}
