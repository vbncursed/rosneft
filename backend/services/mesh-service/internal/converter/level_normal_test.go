package converter

import (
	"fmt"
	"math"
	"math/rand/v2"
	"testing"

	"gotest.tools/v3/assert"
)

// Cloud kinds for planeNormal's bit-exact tests. Every coordinate is built
// from single IEEE operations (no Sincos, no a*b+c), so the clouds are the
// same bits on arm64 and amd64.
const (
	cloudBox = iota
	cloudTilted
	cloudSlab
	cloudCollinear
	cloudIdentical
	cloudTwoPoints
	cloudNaN
	cloudInf
	cloudOffset
	cloudPlaneX
	cloudPlaneZ
	cloudNegativeNormal
	cloudKinds
)

// cloud builds n vertices of the given kind, spread over scale.
func cloud(rng *rand.Rand, kind, n int, scale float64) []vertex {
	u := func() float64 { return 2*rng.Float64() - 1 }
	v := func(x, y, z float64) vertex {
		return vertex{float32(x * scale), float32(y * scale), float32(z * scale)}
	}
	slope := 4 * rng.Float64()
	noise := [...]float64{0, 1e-4, 1e-2, 0.2}[rng.IntN(4)]
	dir := [3]float64{u(), u(), u()}
	ps := make([]vertex, n)
	for i := range ps {
		x, z := float64(u()), float64(u())
		switch kind {
		case cloudBox:
			ps[i] = v(x, u(), z)
		case cloudTilted:
			ps[i] = v(x, float64(z*slope)+float64(noise*u()), z)
		case cloudSlab:
			ps[i] = v(x, float64(0.2*u()), z)
		case cloudCollinear:
			ps[i] = v(float64(x*dir[0]), float64(x*dir[1]), float64(x*dir[2]))
		case cloudIdentical:
			ps[i] = v(0.5, -0.25, 3)
		case cloudTwoPoints:
			ps[i] = v(float64(i%2), float64(i%2), 0)
		case cloudNaN:
			ps[i] = v(x, float64(noise*u()), z)
			if i == n/2 {
				ps[i][1] = float32(math.NaN())
			}
		case cloudInf:
			ps[i] = v(x, float64(noise*u()), z)
			if i == n/3 {
				ps[i][0] = float32(math.Inf(1))
			}
		case cloudOffset:
			ps[i] = vertex{
				float32(1e6 + float64(x*scale)),
				float32(5e5 + float64(noise*u())),
				float32(1e6 + float64(z*scale)),
			}
		case cloudPlaneX:
			ps[i] = v(float64(noise*u()), x, z)
		case cloudPlaneZ:
			ps[i] = v(x, z, float64(noise*u()))
		default: // cloudNegativeNormal: a plane tilted towards -Y
			ps[i] = v(x, float64(-z*slope), z)
		}
	}
	return ps
}

// bits is Float64bits with every NaN folded to one pattern: the payload of a
// NaN is not an architecture-independent fact.
func bits(f float64) uint64 {
	if math.IsNaN(f) {
		return 0x7ff8000000000001
	}
	return math.Float64bits(f)
}

type planeResult struct {
	n    [3]uint64
	flat uint64
	ok   bool
}

func resultOf(ps []vertex) planeResult {
	n, flat, ok := planeNormal(ps)
	return planeResult{[3]uint64{bits(n[0]), bits(n[1]), bits(n[2])}, bits(flat), ok}
}

// planeSweep is every (kind, count, scale) planeNormal's golden table covers.
func planeSweep() (names []string, build map[string]func() []vertex) {
	build = map[string]func() []vertex{}
	add := func(kind, n int, scale float64) {
		name := fmt.Sprintf("kind%d/n%d/s%g", kind, n, scale)
		names = append(names, name)
		build[name] = func() []vertex {
			return cloud(rand.New(rand.NewPCG(uint64(kind), uint64(n))), kind, n, scale)
		}
	}
	for kind := range cloudKinds {
		for _, n := range []int{0, 1, 2, 3, 4, 25, 40} {
			add(kind, n, 1)
		}
		for _, scale := range []float64{1e-30, 1e-20, 1e-3, 1e3, 1e15, 1e30} {
			add(kind, 40, scale)
		}
	}
	return names, build
}

// The results below were recorded from planeNormal before it was split, so
// they pin its exact floating-point output: a refactor must reproduce every bit.
func TestPlaneNormalBitExact(t *testing.T) {
	names, build := planeSweep()
	assert.Equal(t, len(names), len(planeGoldens))
	for _, name := range names {
		t.Run(name, func(t *testing.T) {
			assert.Equal(t, resultOf(build[name]()), planeGoldens[name])
		})
	}
}
