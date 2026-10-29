package glbexport

import (
	"math"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type SincosSuite struct{ suite.Suite }

func TestSincosSuite(t *testing.T) { suite.Run(t, new(SincosSuite)) }

// The expected bits come from math.Sincos built for amd64, which never fuses.
// On arm64 math.Sincos(0.75) ends in ...341, so comparing with it would not
// pin the result.
func (s *SincosSuite) TestSameBitsOnEveryArchitecture() {
	cases := []struct{ x, sin, cos float64 }{
		{0.15, 0.14943813247359922, 0.9887710779360424},
		{0.75, 0.6816387600233342, 0.7316888688738209},
		{1.25, 0.9489846193555862, 0.3153223623952687},
		{-0.6, -0.5646424733950354, 0.8253356149096783},
		{2.5, 0.5984721441039564, -0.8011436155469337},
		{3, 0.1411200080598672, -0.9899924966004454},
		{5.5, -0.7055403255703919, 0.70866977429126},
	}
	for _, tc := range cases {
		gotSin, gotCos := sincos(tc.x)
		assert.Equal(s.T(), gotSin, tc.sin, "sin(%v)", tc.x)
		assert.Equal(s.T(), gotCos, tc.cos, "cos(%v)", tc.x)
	}
}

func (s *SincosSuite) TestFarArgumentsStayAccurate() {
	for _, x := range []float64{7, -100, 12345.678, 1e9} {
		gotSin, gotCos := sincos(x)
		wantSin, wantCos := math.Sincos(x)
		assert.Assert(s.T(), math.Abs(gotSin-wantSin) < 1e-6 && math.Abs(gotCos-wantCos) < 1e-6, "x=%v", x)
	}
}

func (s *SincosSuite) TestNonFiniteIsNaN() {
	for _, x := range []float64{math.NaN(), math.Inf(1), math.Inf(-1)} {
		gotSin, gotCos := sincos(x)
		assert.Assert(s.T(), math.IsNaN(gotSin) && math.IsNaN(gotCos), "x=%v", x)
	}
}

// sincosBits is the argument and both results as IEEE-754 bits, recorded from
// this function before it was restructured and identical on arm64 and amd64:
// zeros of either sign, subnormals, every octant boundary and its neighbours,
// huge arguments, NaN and the infinities.
var sincosBits = [][3]uint64{
	{0x0000000000000000, 0x0000000000000000, 0x3ff0000000000000},
	{0x8000000000000000, 0x8000000000000000, 0x3ff0000000000000},
	{0x0000000000000001, 0x0000000000000001, 0x3ff0000000000000},
	{0x01a56e1fc2f8f359, 0x01a56e1fc2f8f359, 0x3ff0000000000000},
	{0x3ddb7cdfd9d7bdbb, 0x3ddb7cdfd9d7bdbb, 0x3ff0000000000000},
	{0x3ee4f8b588e368f1, 0x3ee4f8b588e1e8a2, 0x3feffffffff920c8},
	{0x3fb999999999999a, 0x3fb98eaecb8bcb2c, 0x3fefd712f9a817c0},
	{0x3fe0000000000000, 0x3fdeaee8744b05f0, 0x3fec1528065b7d50},
	{0x3fe8000000000000, 0x3fe5cffc16bf8f0e, 0x3fe769fec655211f},
	{0x3ff0000000000000, 0x3feaed548f090cee, 0x3fe14a280fb5068c},
	{0xbff0000000000000, 0xbfeaed548f090cee, 0x3fe14a280fb5068c},
	{0x3ff8000000000000, 0x3fefeb7a9b2c6d8b, 0x3fb21bd54fc5f9a7},
	{0x4000000000000000, 0x3fed18f6ead1b445, 0xbfdaa22657537205},
	{0x4008000000000000, 0x3fc210386db6d55b, 0xbfefae04be85e5d2},
	{0xc00c000000000000, 0x3fd6733b7eba621f, 0xbfedf77403c11a5f},
	{0x4012000000000000, 0xbfef47ed3dc74080, 0xbfcafb5b54583d6b},
	{0x4018000000000000, 0xbfd1e1f18ab0a2c0, 0x3feeb9b7097822f6},
	{0x401921fb53c8d4f1, 0xbe3ed609d1a62633, 0x3ff0000000000000},
	{0x401c000000000000, 0x3fe50608c26d0a0a, 0x3fe81ff79ed92015},
	{0x4059000000000000, 0xbfe03425b78c4d9b, 0x3feb981dbf665ff0},
	{0xc059000000000000, 0x3fe03425b78c4d9b, 0x3feb981dbf665ff0},
	{0x41cdcd6500000000, 0x3fe1778cc00cd87a, 0x3feacff8bbc9d815},
	{0x430c6bf526340000, 0x3feacdc9d9884217, 0xbfe17ae632761c3a},
	{0x4480f0cf064dd592, 0x3febf809b25497f6, 0x3fdf189552bfea01},
	{0x7e37e43c8800759c, 0xbfe52ec076f4df9d, 0x3fe7fc3f18dde1da},
	{0x7fefffffffffffff, 0x3fe18de30098ff11, 0x3feac15e48c1813a},
	{0xffefffffffffffff, 0xbfe18de30098ff11, 0x3feac15e48c1813a},
	{0x7ff8000000000001, 0x7ff8000000000001, 0x7ff8000000000001},
	{0x7ff0000000000000, 0x7ff8000000000001, 0x7ff8000000000001},
	{0xfff0000000000000, 0x7ff8000000000001, 0x7ff8000000000001},
	{0x401921fb54442d18, 0x0000000000000000, 0x3ff0000000000000},
	{0xc01921fb54442d18, 0x0000000000000000, 0x3ff0000000000000},
	{0x402921fb54442d18, 0x0000000000000000, 0x3ff0000000000000},
	{0x40a88b2f704a940a, 0x3d52000000000000, 0x3ff0000000000000},
	{0xc01c463abeccb2bb, 0xbfe6a09e667f3bcc, 0x3fe6a09e667f3bcd},
	{0xc01c463abeccb2ba, 0xbfe6a09e667f3bc7, 0x3fe6a09e667f3bd3},
	{0xc01c463abeccb2bc, 0xbfe6a09e667f3bd1, 0x3fe6a09e667f3bc8},
	{0xc01921fb54442d18, 0x0000000000000000, 0x3ff0000000000000},
	{0xc01921fb54442d17, 0x3cd469898cc51700, 0x3ff0000000000000},
	{0xc01921fb54442d19, 0xbcd0000000000000, 0x3ff0000000000000},
	{0xc015fdbbe9bba775, 0x3fe6a09e667f3bce, 0x3fe6a09e667f3bcc},
	{0xc015fdbbe9bba774, 0x3fe6a09e667f3bd4, 0x3fe6a09e667f3bc5},
	{0xc015fdbbe9bba776, 0x3fe6a09e667f3bc8, 0x3fe6a09e667f3bd1},
	{0xc012d97c7f3321d2, 0x3ff0000000000000, 0xbcaa79394c9e8a00},
	{0xc012d97c7f3321d1, 0x3ff0000000000000, 0xbcd34f272993d140},
	{0xc012d97c7f3321d3, 0x3ff0000000000000, 0x3cc961b1acd85d80},
	{0xc00f6a7a2955385e, 0x3fe6a09e667f3bcc, 0xbfe6a09e667f3bce},
	{0xc00f6a7a2955385d, 0x3fe6a09e667f3bc9, 0xbfe6a09e667f3bd0},
	{0xc00f6a7a2955385f, 0x3fe6a09e667f3bce, 0xbfe6a09e667f3bcb},
	{0xc00921fb54442d18, 0xbca1a62633145c00, 0xbff0000000000000},
	{0xc00921fb54442d17, 0xbcc469898cc51700, 0xbff0000000000000},
	{0xc00921fb54442d19, 0x3cb72cece675d200, 0xbff0000000000000},
	{0xc002d97c7f3321d2, 0xbfe6a09e667f3bcd, 0xbfe6a09e667f3bcc},
	{0xc002d97c7f3321d1, 0xbfe6a09e667f3bd0, 0xbfe6a09e667f3bc9},
	{0xc002d97c7f3321d3, 0xbfe6a09e667f3bca, 0xbfe6a09e667f3bcf},
	{0xbff921fb54442d18, 0xbff0000000000000, 0x3c91a62633145c00},
	{0xbff921fb54442d17, 0xbff0000000000000, 0x3cb469898cc51700},
	{0xbff921fb54442d19, 0xbff0000000000000, 0xbca72cece675d200},
	{0xbfe921fb54442d18, 0xbfe6a09e667f3bcc, 0x3fe6a09e667f3bcd},
	{0xbfe921fb54442d17, 0xbfe6a09e667f3bcc, 0x3fe6a09e667f3bce},
	{0xbfe921fb54442d19, 0xbfe6a09e667f3bcd, 0x3fe6a09e667f3bcc},
	{0x0000000000000000, 0x0000000000000000, 0x3ff0000000000000},
	{0x0000000000000001, 0x0000000000000001, 0x3ff0000000000000},
	{0x8000000000000001, 0x8000000000000001, 0x3ff0000000000000},
	{0x3fe921fb54442d18, 0x3fe6a09e667f3bcc, 0x3fe6a09e667f3bcd},
	{0x3fe921fb54442d19, 0x3fe6a09e667f3bcd, 0x3fe6a09e667f3bcc},
	{0x3fe921fb54442d17, 0x3fe6a09e667f3bcc, 0x3fe6a09e667f3bce},
	{0x3ff921fb54442d18, 0x3ff0000000000000, 0x3c91a62633145c00},
	{0x3ff921fb54442d19, 0x3ff0000000000000, 0xbca72cece675d200},
	{0x3ff921fb54442d17, 0x3ff0000000000000, 0x3cb469898cc51700},
	{0x4002d97c7f3321d2, 0x3fe6a09e667f3bcd, 0xbfe6a09e667f3bcc},
	{0x4002d97c7f3321d3, 0x3fe6a09e667f3bca, 0xbfe6a09e667f3bcf},
	{0x4002d97c7f3321d1, 0x3fe6a09e667f3bd0, 0xbfe6a09e667f3bc9},
	{0x400921fb54442d18, 0x3ca1a62633145c00, 0xbff0000000000000},
	{0x400921fb54442d19, 0xbcb72cece675d200, 0xbff0000000000000},
	{0x400921fb54442d17, 0x3cc469898cc51700, 0xbff0000000000000},
	{0x400f6a7a2955385e, 0xbfe6a09e667f3bcc, 0xbfe6a09e667f3bce},
	{0x400f6a7a2955385f, 0xbfe6a09e667f3bce, 0xbfe6a09e667f3bcb},
	{0x400f6a7a2955385d, 0xbfe6a09e667f3bc9, 0xbfe6a09e667f3bd0},
	{0x4012d97c7f3321d2, 0xbff0000000000000, 0xbcaa79394c9e8a00},
	{0x4012d97c7f3321d3, 0xbff0000000000000, 0x3cc961b1acd85d80},
	{0x4012d97c7f3321d1, 0xbff0000000000000, 0xbcd34f272993d140},
	{0x4015fdbbe9bba775, 0xbfe6a09e667f3bce, 0x3fe6a09e667f3bcc},
	{0x4015fdbbe9bba776, 0xbfe6a09e667f3bc8, 0x3fe6a09e667f3bd1},
	{0x4015fdbbe9bba774, 0xbfe6a09e667f3bd4, 0x3fe6a09e667f3bc5},
	{0x401921fb54442d18, 0x0000000000000000, 0x3ff0000000000000},
	{0x401921fb54442d19, 0x3cd0000000000000, 0x3ff0000000000000},
	{0x401921fb54442d17, 0xbcd469898cc51700, 0x3ff0000000000000},
	{0x401c463abeccb2bb, 0x3fe6a09e667f3bcc, 0x3fe6a09e667f3bcd},
	{0x401c463abeccb2bc, 0x3fe6a09e667f3bd1, 0x3fe6a09e667f3bc8},
	{0x401c463abeccb2ba, 0x3fe6a09e667f3bc7, 0x3fe6a09e667f3bd3},
}

func (s *SincosSuite) TestBitIdenticalOverTheSpread() {
	for _, row := range sincosBits {
		x := math.Float64frombits(row[0])
		gotSin, gotCos := sincos(x)
		assert.Equal(s.T(), math.Float64bits(gotSin), row[1], "sin bits of %v", x)
		assert.Equal(s.T(), math.Float64bits(gotCos), row[2], "cos bits of %v", x)
	}
}
