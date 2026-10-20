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
