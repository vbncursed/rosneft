package converter

import (
	"cmp"
	"math"
	"slices"
)

// ponytail: a hillside with a steep overall slope is levelled flat too. The
// ceiling is levelMaxTilt; the upgrade path is an explicit levelling choice at
// upload instead of guessing from the mesh.
const (
	levelMaxFlatness = 0.25               // sqrt(λmin/λmid): below this the mesh is a slab
	levelMinTilt     = 3 * math.Pi / 180  // smaller tilts are the source's own level
	levelMaxTilt     = 60 * math.Pi / 180 // steeper normals are not a ground plane
	jacobiSweeps     = 50
	jacobiEpsilon    = 1e-30
)

// levelPositions rotates a non-model mesh in place so its plane normal points
// along +Y, and reports whether it did. A mesh that is not flat, or whose
// normal is within levelMinTilt or beyond levelMaxTilt of +Y, is untouched.
func levelPositions(positions []vertex) bool {
	n, flatness, ok := planeNormal(positions)
	if !ok {
		return false
	}
	m, applied := levelRotation(n, flatness)
	if !applied {
		return false
	}
	for i, p := range positions {
		x, y, z := float64(p[0]), float64(p[1]), float64(p[2])
		positions[i] = vertex{
			float32(float64(m[0]*x) + float64(m[1]*y) + float64(m[2]*z)),
			float32(float64(m[3]*x) + float64(m[4]*y) + float64(m[5]*z)),
			float32(float64(m[6]*x) + float64(m[7]*y) + float64(m[8]*z)),
		}
	}
	return true
}

// levelRotation returns the row-major rotation taking n (unit, n[1] >= 0) to
// +Y by the minimal rotation (Rodrigues, axis n × Y), or applied=false when
// the mesh is not flat enough or the tilt is outside (levelMinTilt, levelMaxTilt].
func levelRotation(n [3]float64, flatness float64) (m [9]float64, applied bool) {
	tilt := math.Acos(min(n[1], 1))
	if flatness >= levelMaxFlatness || tilt <= levelMinTilt || tilt > levelMaxTilt {
		return m, false
	}
	// v = n × Y; R = I + K + K²/(1+cos), K = [v]×.
	v := [3]float64{-n[2], 0, n[0]}
	k := [9]float64{0, -v[2], v[1], v[2], 0, -v[0], -v[1], v[0], 0}
	for i := range 3 {
		for j := range 3 {
			k2 := float64(k[3*i]*k[j]) + float64(k[3*i+1]*k[3+j]) + float64(k[3*i+2]*k[6+j])
			m[3*i+j] = k[3*i+j] + float64(k2/(1+n[1]))
		}
	}
	m[0]++
	m[4]++
	m[8]++
	return m, true
}

// planeNormal returns the unit normal of the best-fit plane (the covariance
// eigenvector of the smallest eigenvalue, oriented so n[1] >= 0) and
// flatness = sqrt(λmin/λmid). ok is false for fewer than 3 vertices or a
// degenerate (collinear or single-point) cloud.
func planeNormal(positions []vertex) (n [3]float64, flatness float64, ok bool) {
	if len(positions) < 3 {
		return n, 0, false
	}
	var mean [3]float64
	for _, p := range positions {
		for i := range 3 {
			mean[i] += float64(p[i])
		}
	}
	for i := range mean {
		mean[i] /= float64(len(positions))
	}
	var cov [3][3]float64
	for _, p := range positions {
		d := [3]float64{float64(p[0]) - mean[0], float64(p[1]) - mean[1], float64(p[2]) - mean[2]}
		for i := range 3 {
			for j := i; j < 3; j++ {
				cov[i][j] += float64(d[i] * d[j])
			}
		}
	}
	for i := range 3 {
		for j := range i {
			cov[i][j] = cov[j][i]
		}
	}
	vals, vecs := eigenSym3(cov)
	order := []int{0, 1, 2}
	slices.SortFunc(order, func(i, j int) int { return cmp.Compare(vals[i], vals[j]) })
	lo, mid, hi := vals[order[0]], vals[order[1]], vals[order[2]]
	if hi <= 0 || mid <= 1e-12*hi {
		return n, 0, false
	}
	for i := range 3 {
		n[i] = vecs[i][order[0]]
	}
	if n[1] < 0 {
		n = [3]float64{-n[0], -n[1], -n[2]}
	}
	return n, math.Sqrt(max(lo, 0) / mid), true
}

// eigenSym3 diagonalises a symmetric 3×3 matrix with cyclic Jacobi rotations;
// column k of vecs is the eigenvector of vals[k]. The sweep order is fixed, so
// the result is deterministic.
func eigenSym3(a [3][3]float64) (vals [3]float64, vecs [3][3]float64) {
	vecs = [3][3]float64{{1, 0, 0}, {0, 1, 0}, {0, 0, 1}}
	for range jacobiSweeps {
		off := float64(a[0][1]*a[0][1]) + float64(a[0][2]*a[0][2]) + float64(a[1][2]*a[1][2])
		diag := float64(a[0][0]*a[0][0]) + float64(a[1][1]*a[1][1]) + float64(a[2][2]*a[2][2])
		if off <= jacobiEpsilon*diag {
			break
		}
		for _, pq := range [3][2]int{{0, 1}, {0, 2}, {1, 2}} {
			p, q := pq[0], pq[1]
			if a[p][q] == 0 {
				continue
			}
			theta := (a[q][q] - a[p][p]) / (2 * a[p][q])
			t := math.Copysign(1, theta) / (math.Abs(theta) + math.Sqrt(float64(theta*theta)+1))
			c := 1 / math.Sqrt(float64(t*t)+1)
			s := t * c
			for k := range 3 {
				a[k][p], a[k][q] = float64(c*a[k][p])-float64(s*a[k][q]), float64(s*a[k][p])+float64(c*a[k][q])
				vecs[k][p], vecs[k][q] = float64(c*vecs[k][p])-float64(s*vecs[k][q]), float64(s*vecs[k][p])+float64(c*vecs[k][q])
			}
			for k := range 3 {
				a[p][k], a[q][k] = float64(c*a[p][k])-float64(s*a[q][k]), float64(s*a[p][k])+float64(c*a[q][k])
			}
		}
	}
	return [3]float64{a[0][0], a[1][1], a[2][2]}, vecs
}
