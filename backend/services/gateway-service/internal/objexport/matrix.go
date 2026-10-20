package objexport

import (
	"github.com/qmuntal/gltf"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

// Every sum of products here rounds each product with float64(...) first.
// arm64 would otherwise fuse a*b+c into one FMA and amd64 would not, so the
// last bit of a matrix, and of the OBJ text printed from it, would depend on
// the machine.

// mat4 is column-major, as glTF: element (row r, column c) is m[c*4+r].
type mat4 [16]float64

// swizzle maps scene (x, y, z) to OBJ (x, -z, y); a rotation, det +1.
var swizzle = mat4{0: 1, 6: 1, 9: -1, 15: 1}

// mul is a·b.
func (a mat4) mul(b mat4) mat4 {
	var c mat4
	for col := range 4 {
		for row := range 4 {
			var sum float64
			for k := range 4 {
				sum += float64(a[k*4+row] * b[col*4+k])
			}
			c[col*4+row] = sum
		}
	}
	return c
}

// apply transforms the point p.
func (m mat4) apply(x, y, z float64) (float64, float64, float64) {
	return float64(m[0]*x) + float64(m[4]*y) + float64(m[8]*z) + m[12],
		float64(m[1]*x) + float64(m[5]*y) + float64(m[9]*z) + m[13],
		float64(m[2]*x) + float64(m[6]*y) + float64(m[10]*z) + m[14]
}

// det3 is the determinant of the upper-left 3x3.
func (m mat4) det3() float64 {
	return float64(m[0]*(float64(m[5]*m[10])-float64(m[9]*m[6]))) -
		float64(m[4]*(float64(m[1]*m[10])-float64(m[9]*m[2]))) +
		float64(m[8]*(float64(m[1]*m[6])-float64(m[5]*m[2])))
}

// trs is T·R·S for the unit quaternion q = (x, y, z, w).
func trs(t [3]float64, q [4]float64, s [3]float64) mat4 {
	x, y, z, w := q[0], q[1], q[2], q[3]
	xx, yy, zz := float64(x*x), float64(y*y), float64(z*z)
	xy, xz, yz := float64(x*y), float64(x*z), float64(y*z)
	xw, yw, zw := float64(x*w), float64(y*w), float64(z*w)
	r := [3][3]float64{
		{1 - 2*(yy+zz), 2 * (xy - zw), 2 * (xz + yw)},
		{2 * (xy + zw), 1 - 2*(xx+zz), 2 * (yz - xw)},
		{2 * (xz - yw), 2 * (yz + xw), 1 - 2*(xx+yy)},
	}
	var m mat4
	for c := range 3 {
		for row := range 3 {
			m[c*4+row] = r[row][c] * s[c]
		}
		m[12+c] = t[c]
	}
	m[15] = 1
	return m
}

// nodeLocal is the node's matrix times its TRS (one of them is identity).
func nodeLocal(n *gltf.Node) mat4 {
	return mat4(n.MatrixOrDefault()).mul(trs(n.TranslationOrDefault(), n.RotationOrDefault(), n.ScaleOrDefault()))
}

func placementMatrix(p glbexport.Placement) mat4 {
	return trs(p.Translation, glbexport.QuatFromEulerXYZ(p.Rotation[0], p.Rotation[1], p.Rotation[2]), p.Scale)
}

// bakeBase is the part of every F that does not depend on the placement:
// the swizzle after the ratio.
func bakeBase(ratio float64) mat4 {
	return swizzle.mul(mat4{0: ratio, 5: ratio, 10: ratio, 15: 1})
}
