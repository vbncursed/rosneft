package glbexport

import "math"

// Cephes coefficients, the ones math.Sincos uses.
var (
	sinCoef = [6]float64{
		1.58962301576546568060e-10, -2.50507477628578072866e-8, 2.75573136213857245213e-6,
		-1.98412698295895385996e-4, 8.33333333332211858878e-3, -1.66666666666666307295e-1,
	}
	cosCoef = [6]float64{
		-1.13585365213876817300e-11, 2.08757008419747316778e-9, -2.75573141792967388112e-7,
		2.48015872888517045348e-5, -1.38888888888730564116e-3, 4.16666666666665929218e-2,
	}
)

// horner evaluates the polynomial the way math.Sincos does. float64(...) rounds
// each product before the add: arm64 otherwise fuses them into FMAs and amd64
// does not, so the last bit of the result would depend on the machine.
func horner(coef *[6]float64, zz float64) float64 {
	r := coef[0]
	for _, c := range coef[1:] {
		r = float64(r*zz) + c
	}
	return r
}

// Pi/4 split into three parts, so the reduction loses no bits.
const (
	pi4A = 7.85398125648498535156e-1
	pi4B = 3.77489470793079817668e-8
	pi4C = 2.69515142907905952645e-15
)

// reduce brings x >= 0 to z in [-Pi/4, Pi/4] and says which quarter turn j
// (0..3) it came from, and whether the half turn was a reflection in the x axis.
func reduce(x float64) (z float64, j uint64, reflected bool) {
	j = uint64(float64(x * (4 / math.Pi)))
	y := float64(j)
	if j&1 == 1 { // map zeros to origin
		j++
		y++
	}
	j &= 7
	z = ((x - float64(y*pi4A)) - float64(y*pi4B)) - float64(y*pi4C)
	if j > 3 {
		j -= 4
		reflected = true
	}
	return z, j, reflected
}

func negIf(v float64, neg bool) float64 {
	if neg {
		return -v
	}
	return v
}

// sincos is math.Sincos without fused multiply-adds, so an export is
// byte-identical whichever architecture produced it. math.Sincos(0.75) ends in
// ...341 on arm64 and ...342 on amd64.
func sincos(x float64) (sin, cos float64) {
	if x == 0 {
		return x, 1
	}
	// Mod is exact, and below 2*Pi it returns x unchanged. It also keeps x
	// under math's Payne-Hanek threshold, which this copy does not carry.
	x = math.Mod(x, 2*math.Pi)
	if math.IsNaN(x) {
		return x, x
	}
	negative := x < 0 // not math.Abs: Mod can return -0, which keeps its sign
	if negative {
		x = -x
	}
	z, j, reflected := reduce(x)
	zz := float64(z * z)
	cos = 1.0 - float64(0.5*zz) + float64(float64(zz*zz)*horner(&cosCoef, zz))
	sin = z + float64(float64(z*zz)*horner(&sinCoef, zz))
	if j == 1 || j == 2 {
		sin, cos = cos, sin
	}
	return negIf(sin, negative != reflected), negIf(cos, reflected != (j > 1))
}
