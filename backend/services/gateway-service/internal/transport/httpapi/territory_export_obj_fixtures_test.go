package httpapi

import (
	"encoding/binary"
	"fmt"
)

// objTriJSON is one indexed triangle: float32 POSITION at 0 (36 bytes), uint16
// indices at 36 (6 bytes), the smallest document objexport accepts.
const objTriJSON = `{"asset":{"version":"2.0"},"scene":0,"scenes":[{"nodes":[0]}],` +
	`"nodes":[{"name":"n","mesh":0}],"meshes":[{"primitives":[{"attributes":{"POSITION":0},"indices":1}]}],` +
	`"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"},` +
	`{"bufferView":1,"componentType":5123,"count":3,"type":"SCALAR"}],` +
	`"bufferViews":[{"buffer":0,"byteLength":36},{"buffer":0,"byteOffset":36,"byteLength":6}],` +
	`"buffers":[{"byteLength":42}]}`

func objTriGLB() []byte {
	var bin []byte
	for _, f := range []float32{0, 0, 0, 1, 0, 0, 0, 1, 0} {
		bin = binary.LittleEndian.AppendUint32(bin, f32bits(f))
	}
	for _, i := range []uint16{0, 1, 2} {
		bin = binary.LittleEndian.AppendUint16(bin, i)
	}
	bin = append(bin, 0, 0) // pad the BIN chunk to 4
	return glb(objTriJSON, bin, len(bin))
}

// objBigGLB declares 20,000,001 vertices (over the ceiling) without carrying
// them: Build refuses on the counts alone, so only the head is ever read.
func objBigGLB() []byte {
	const positions = 20_000_001 * 12
	js := fmt.Sprintf(`{"asset":{"version":"2.0"},"scene":0,"scenes":[{"nodes":[0]}],`+
		`"nodes":[{"name":"n","mesh":0}],"meshes":[{"primitives":[{"attributes":{"POSITION":0},"indices":1}]}],`+
		`"accessors":[{"bufferView":0,"componentType":5126,"count":20000001,"type":"VEC3"},`+
		`{"bufferView":1,"componentType":5125,"count":3,"type":"SCALAR"}],`+
		`"bufferViews":[{"buffer":0,"byteLength":%d},{"buffer":0,"byteOffset":%d,"byteLength":12}],`+
		`"buffers":[{"byteLength":%d}]}`, positions, positions, positions+12)
	return glb(js, nil, positions+12)
}
