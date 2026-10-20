package objexport

import (
	"math"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type NamesSuite struct{ suite.Suite }

func TestNamesSuite(t *testing.T) { suite.Run(t, new(NamesSuite)) }

func (s *NamesSuite) TestObjectNames() {
	cases := []struct{ in, want string }{
		{"a\nmtllib x#y", "a_mtllib x_y"},
		{"Резервуар 01 (тест)", "Резервуар 01 (тест)"},
		{"", "unnamed"},
		{"   ", "unnamed"},
		{"\r\n", "__"},
		{"a\x7Fb", "a_b"},
	}
	for _, tc := range cases {
		s.Run(tc.in, func() {
			assert.Equal(s.T(), objectName(tc.in), tc.want)
		})
	}
}

func (s *NamesSuite) TestFileTokens() {
	cases := []struct{ name, got, want string }{
		{"path traversal", imageFile(0, "../../etc/passwd", "image/png"), "t000_.._.._etc_passwd.png"},
		{"extension stripped case-insensitively", imageFile(0, "textures/ground.PNG", "image/png"), "t000_textures_ground.png"},
		{"empty image", imageFile(0, "", "image/jpeg"), "t000_image.jpg"},
		{"non-ASCII material", materialFile(0, "Металл"), "m000_" + strings.Repeat("_", 6)},
		{"empty material", materialFile(7, ""), "m007_material"},
		{"cut at 48 bytes", materialFile(1, strings.Repeat("a", 60)), "m001_" + strings.Repeat("a", 48)},
		{"stem", stemOf(`a";x=y`), "a__x_y"},
		{"empty stem", stemOf(""), "territory"},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			assert.Equal(s.T(), tc.got, tc.want)
		})
	}
}

func (s *NamesSuite) TestUnitRatio() {
	cases := []struct {
		name     string
		lo, hi   [3]float64
		ratio    float64
		isMetric bool
	}{
		{"dji", [3]float64{258684.4, 345, -4088459.25}, [3]float64{259129, 403, -4087795}, 332.125, true},
		{"zero bbox", [3]float64{}, [3]float64{}, 1, false},
		{"NaN component", [3]float64{0, 0, 0}, [3]float64{1, math.NaN(), 1}, 1, false},
		{"max below min", [3]float64{1, 1, 1}, [3]float64{0, 0, 0}, 1, false},
		{"one side inverted, as the viewer", [3]float64{0, 0, 0}, [3]float64{4, -1, 2}, 2, true},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			ratio, metric := UnitRatio(tc.lo, tc.hi)

			assert.Equal(s.T(), ratio, tc.ratio)
			assert.Equal(s.T(), metric, tc.isMetric)
		})
	}
}
