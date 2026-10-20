package converter

import (
	"fmt"
	"math"
	"math/rand/v2"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gotest.tools/v3/assert"
)

const gridN = 21

// tiltedGrid is an n×n grid of the plane y=0 rotated by deg about X:
// (x, 0, z) → (x, -z·sin, z·cos). Its normal is (0, cos, sin).
func tiltedGrid(deg, noise float64) []vertex {
	rng := rand.New(rand.NewPCG(1, 2))
	sin, cos := math.Sincos(deg * math.Pi / 180)
	ps := make([]vertex, 0, gridN*gridN)
	for x := range gridN {
		for z := range gridN {
			fx, fz := float64(x), float64(z)
			ps = append(ps, vertex{
				float32(fx + noise*rng.NormFloat64()),
				float32(-fz*sin + noise*rng.NormFloat64()),
				float32(fz*cos + noise*rng.NormFloat64()),
			})
		}
	}
	return ps
}

func mulVec(m [9]float64, v [3]float64) [3]float64 {
	var r [3]float64
	for i := range 3 {
		r[i] = m[3*i]*v[0] + m[3*i+1]*v[1] + m[3*i+2]*v[2]
	}
	return r
}

func TestPlaneNormal(t *testing.T) {
	sin, cos := math.Sincos(36 * math.Pi / 180)
	n, flat, ok := planeNormal(tiltedGrid(36, 0.05))
	assert.Assert(t, ok)
	assert.Assert(t, flat < 0.25, "flatness %v", flat)
	dot := n[1]*cos + n[2]*sin
	assert.Assert(t, dot > math.Cos(0.5*math.Pi/180), "normal %v", n)
	assert.Assert(t, n[1] >= 0)
}

func TestPlaneNormalDegenerate(t *testing.T) {
	_, _, ok := planeNormal([]vertex{{0, 0, 0}, {1, 1, 1}})
	assert.Assert(t, !ok, "fewer than 3 vertices")
	_, _, ok = planeNormal([]vertex{{1, 2, 3}, {1, 2, 3}, {1, 2, 3}})
	assert.Assert(t, !ok, "identical vertices")
	_, _, ok = planeNormal([]vertex{{0, 0, 0}, {1, 1, 1}, {2, 2, 2}})
	assert.Assert(t, !ok, "collinear vertices")
}

func TestLevelRotation(t *testing.T) {
	tests := []struct {
		name      string
		deg       float64
		flatness  float64
		wantApply bool
	}{
		{"36 degrees is levelled", 36, 0.05, true},
		{"60 degrees is the ceiling", 60, 0.05, true},
		{"1.5 degrees is left alone", 1.5, 0.05, false},
		{"70 degrees is left alone", 70, 0.05, false},
		{"not flat is left alone", 36, 0.6, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sin, cos := math.Sincos(tt.deg * math.Pi / 180)
			n := [3]float64{0, cos, sin}
			m, applied := levelRotation(n, tt.flatness)
			assert.Equal(t, applied, tt.wantApply)
			if !applied {
				return
			}
			r := mulVec(m, n)
			for i, want := range [3]float64{0, 1, 0} {
				assert.Assert(t, math.Abs(r[i]-want) < 1e-9, "R·n = %v", r)
			}
		})
	}
}

// A mirrored rotation would flatten the plane too; the vertex position tells
// them apart.
func TestLevelPositionsDirection(t *testing.T) {
	for _, deg := range []float64{36, -36} {
		t.Run(fmt.Sprintf("%+.0f degrees", deg), func(t *testing.T) {
			ps := tiltedGrid(deg, 0)
			assert.Assert(t, levelPositions(ps))
			got := ps[5*gridN+10] // x=5, z=10
			want := vertex{5, 0, 10}
			for i := range 3 {
				assert.Assert(t, math.Abs(float64(got[i]-want[i])) < 1e-4, "got %v want %v", got, want)
			}
		})
	}
}

func TestLevelPositionsLeavesNonFlatMeshBitIdentical(t *testing.T) {
	cube := []vertex{
		{0, 0, 0},
		{1, 0, 0},
		{0, 1, 0},
		{1, 1, 0},
		{0, 0, 1},
		{1, 0, 1},
		{0, 1, 1},
		{1, 1, 1},
	}
	want := append([]vertex(nil), cube...)
	assert.Assert(t, !levelPositions(cube))
	assert.DeepEqual(t, cube, want)
}

func writeGridOBJ(t *testing.T, ps []vertex) string {
	t.Helper()
	var b strings.Builder
	for _, p := range ps {
		fmt.Fprintf(&b, "v %g %g %g\n", p[0], p[1], p[2])
	}
	for x := range gridN - 1 {
		for z := range gridN - 1 {
			a := x*gridN + z + 1
			fmt.Fprintf(&b, "f %d %d %d\nf %d %d %d\n", a, a+gridN, a+1, a+1, a+gridN, a+gridN+1)
		}
	}
	path := filepath.Join(t.TempDir(), "grid.obj")
	assert.NilError(t, os.WriteFile(path, []byte(b.String()), 0o600))
	return path
}

func TestConvertRawLevelsTiltedTerritory(t *testing.T) {
	path := writeGridOBJ(t, tiltedGrid(36, 0))
	raw, err := (&Converter{}).convertRaw(t.Context(), filepath.Dir(path), path)
	assert.NilError(t, err)
	dy := raw.bboxMax.Y - raw.bboxMin.Y
	dx := raw.bboxMax.X - raw.bboxMin.X
	assert.Assert(t, dy <= 0.1*dx, "Y extent %v vs X extent %v", dy, dx)
}

func TestConvertRawKeepsLevelTerritory(t *testing.T) {
	path := writeGridOBJ(t, tiltedGrid(1.5, 0))
	dir := filepath.Dir(path)
	got, err := (&Converter{}).convertRaw(t.Context(), dir, path)
	assert.NilError(t, err)
	// YUpSource skips both the swap and the levelling; this grid is Y-thinnest,
	// so it would not be swapped anyway.
	want, err := (&Converter{}).convertRaw(WithYUpSource(t.Context()), dir, path)
	assert.NilError(t, err)
	assert.DeepEqual(t, got.content, want.content)
	assert.Equal(t, got.bboxMin, want.bboxMin)
	assert.Equal(t, got.bboxMax, want.bboxMax)
}

func TestConvertRawDoesNotLevelModels(t *testing.T) {
	path := writeGridOBJ(t, tiltedGrid(36, 0))
	raw, err := (&Converter{}).convertRaw(WithYUpSource(t.Context()), filepath.Dir(path), path)
	assert.NilError(t, err)
	dy := raw.bboxMax.Y - raw.bboxMin.Y
	assert.Assert(t, dy > 5, "model was levelled: Y extent %v", dy)
}
