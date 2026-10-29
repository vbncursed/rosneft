package converter

import (
	"errors"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// ParseMTLEdgeSuite pins parseMTL's directive dispatch through its public entry.
type ParseMTLEdgeSuite struct{ suite.Suite }

func TestParseMTLEdgeSuite(t *testing.T) { suite.Run(t, new(ParseMTLEdgeSuite)) }

func (s *ParseMTLEdgeSuite) TestDirectives() {
	white := [3]float32{1, 1, 1}
	tests := []struct {
		name string
		mtl  string
		want material
	}{
		{"newmtl without fields", "newmtl", material{"", white, 1, ""}},
		{"newmtl name is trimmed", "newmtl   a b  \n", material{"a b", white, 1, ""}},
		{"CRLF and indentation", "newmtl a\r\n  Kd 0 1 0\r\n\td 0.5\r\n", material{"a", [3]float32{0, 1, 0}, 0.5, ""}},
		{"Kd with tab and a fourth value", "newmtl a\nKd\t0 1 0 9\n", material{"a", [3]float32{0, 1, 0}, 1, ""}},
		{"Tr after d wins", "newmtl a\nd 0.2\nTr 0.25\n", material{"a", white, 0.75, ""}},
		{"d after Tr wins", "newmtl a\nTr 0.25\nd 0.2\n", material{"a", white, 0.2, ""}},
		{
			"unknown and lower-case directives are skipped",
			"newmtl a\nKa 1 1 1\nKs 1 1 1\nNs 3\nillum 2\nbump b.png\nkd 0 0 0\nmap_Ks s.png\n",
			material{"a", white, 1, ""},
		},
		{
			"map_Kd keeps spaces in the path", "newmtl a\nmap_Kd my dir/t x.png\n",
			material{"a", white, 1, "my dir/t x.png"},
		},
		{
			"map_Kd options with fixed argc", "newmtl a\nmap_Kd -o 1 2 3 -mm 0 1 -s 1 1 1 -blendu on t.png\n",
			material{"a", white, 1, "t.png"},
		},
		{
			"map_Kd unknown option takes one argument", "newmtl a\nmap_Kd -vendor 7 t.png\n",
			material{"a", white, 1, "t.png"},
		},
		{"map_Kd with only options", "newmtl a\nmap_Kd -clamp on\n", material{"a", white, 1, ""}},
		{"map_Kd without a value", "newmtl a\nmap_Kd\n", material{"a", white, 1, ""}},
		{"last map_Kd wins", "newmtl a\nmap_Kd one.png\nmap_Kd two.png\n", material{"a", white, 1, "two.png"}},
	}
	for _, tt := range tests {
		s.Run(tt.name, func() {
			mats, err := parseMTL(strings.NewReader(tt.mtl))
			assert.NilError(s.T(), err)
			assert.Equal(s.T(), len(mats), 1)
			assert.Equal(s.T(), mats[0], tt.want)
		})
	}
}

func (s *ParseMTLEdgeSuite) TestDirectivesBeforeNewmtlAreIgnoredEvenIfMalformed() {
	mtl := "Kd x\nd high\nTr high\nmap_Kd a.png\n# c\nnewmtl a\n"
	mats, err := parseMTL(strings.NewReader(mtl))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(mats), 1)
	assert.Equal(s.T(), mats[0].diffuseMap, "")
}

func (s *ParseMTLEdgeSuite) TestConsecutiveNewmtlKeepOrder() {
	mats, err := parseMTL(strings.NewReader("newmtl a\nnewmtl b\nKd 0 0 1\nnewmtl c\n"))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(mats), 3)
	assert.Equal(s.T(), mats[0].name, "a")
	assert.Equal(s.T(), mats[1].kd, [3]float32{0, 0, 1})
	assert.Equal(s.T(), mats[2].kd, [3]float32{1, 1, 1})
}

func (s *ParseMTLEdgeSuite) TestErrors() {
	tests := []struct{ name, mtl, want string }{
		{"Kd with two components", "newmtl a\nKd 1 1\n", "Kd"},
		{"Kd bare", "newmtl a\nKd\n", "Kd"},
		{"d bare", "newmtl a\nd\n", "parseMTL: d "},
		{"d garbage", "newmtl a\nd high\n", "parseMTL: d "},
		{"Tr garbage", "newmtl a\nTr x\n", "parseMTL: Tr "},
		{"line over the scanner limit", "# " + strings.Repeat("x", 1<<20), "scan"},
	}
	for _, tt := range tests {
		s.Run(tt.name, func() {
			_, err := parseMTL(strings.NewReader(tt.mtl))
			assert.Assert(s.T(), errors.Is(err, domain.ErrBadSource), "got %v", err)
			assert.ErrorContains(s.T(), err, "parseMTL")
			assert.ErrorContains(s.T(), err, tt.want)
		})
	}
}
