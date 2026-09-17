package converter

import (
	"bytes"
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"

	"gotest.tools/v3/assert"
)

// buildGLBFixture wraps a raw glTF JSON chunk in a minimal GLB container —
// header plus one JSON chunk, no BIN chunk. glbStats never reads past the
// JSON chunk, so a fixture doesn't need one either.
func buildGLBFixture(t *testing.T, json string) []byte {
	t.Helper()
	body := []byte(json)
	for len(body)%4 != 0 {
		body = append(body, ' ')
	}
	var buf bytes.Buffer
	for _, v := range []uint32{
		0x46546C67,                 // magic "glTF"
		2,                          // version
		12 + 8 + uint32(len(body)), // total length
		uint32(len(body)),          // chunk length
		0x4E4F534A,                 // chunk type "JSON"
	} {
		assert.NilError(t, binary.Write(&buf, binary.LittleEndian, v))
	}
	buf.Write(body)
	return buf.Bytes()
}

// A GLB produced by the converter itself is the only fixture this package
// can build without checking a binary into the repo.
func writeOneTriangleGLB(t *testing.T) []byte {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "tri.obj")
	obj := "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"
	assert.NilError(t, os.WriteFile(path, []byte(obj), 0o600))

	c := &Converter{}
	raw, err := c.convertRaw(t.Context(), path)
	assert.NilError(t, err)
	return raw.content
}

func TestGLBStatsCountsPositionsAndTriangles(t *testing.T) {
	vertices, faces, err := glbStats(writeOneTriangleGLB(t))

	assert.NilError(t, err)
	assert.Equal(t, vertices, uint64(3))
	assert.Equal(t, faces, uint64(1))
}

func TestGLBStatsRejectsGarbage(t *testing.T) {
	_, _, err := glbStats([]byte("not a glb"))

	assert.Assert(t, err != nil)
}

// gltfpack's meshopt-compressed output (the default LOD pass) declares a
// second "fallback" buffer — EXT_meshopt_compression, byteLength set but no
// data — that a compliant reader skips. The accessor counts we need sit
// entirely in the JSON chunk regardless.
func TestGLBStatsHandlesMeshoptFallbackBuffer(t *testing.T) {
	body := buildGLBFixture(t, `{
		"asset": {"version": "2.0"},
		"buffers": [
			{"byteLength": 4},
			{"byteLength": 168, "extensions": {"EXT_meshopt_compression": {"fallback": true}}}
		],
		"accessors": [
			{"componentType": 5126, "count": 8, "type": "VEC3"},
			{"componentType": 5123, "count": 36, "type": "SCALAR"}
		],
		"meshes": [
			{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}
		]
	}`)

	vertices, faces, err := glbStats(body)

	assert.NilError(t, err)
	assert.Equal(t, vertices, uint64(8))
	assert.Equal(t, faces, uint64(12))
}
