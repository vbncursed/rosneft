package objexport

import (
	"github.com/qmuntal/gltf"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

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
				sum += a[k*4+row] * b[col*4+k]
			}
			c[col*4+row] = sum
		}
	}
	return c
}

// apply transforms the point p.
func (m mat4) apply(x, y, z float64) (float64, float64, float64) {
	return m[0]*x + m[4]*y + m[8]*z + m[12],
		m[1]*x + m[5]*y + m[9]*z + m[13],
		m[2]*x + m[6]*y + m[10]*z + m[14]
}

// det3 is the determinant of the upper-left 3x3.
func (m mat4) det3() float64 {
	return m[0]*(m[5]*m[10]-m[9]*m[6]) -
		m[4]*(m[1]*m[10]-m[9]*m[2]) +
		m[8]*(m[1]*m[6]-m[5]*m[2])
}

// trs is T·R·S for the unit quaternion q = (x, y, z, w).
func trs(t [3]float64, q [4]float64, s [3]float64) mat4 {
	x, y, z, w := q[0], q[1], q[2], q[3]
	r := [3][3]float64{
		{1 - 2*(y*y+z*z), 2 * (x*y - z*w), 2 * (x*z + y*w)},
		{2 * (x*y + z*w), 1 - 2*(x*x+z*z), 2 * (y*z - x*w)},
		{2 * (x*z - y*w), 2 * (y*z + x*w), 1 - 2*(x*x+y*y)},
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
