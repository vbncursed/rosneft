package converter

import (
	"encoding/binary"
	"encoding/json"
	"fmt"

	"github.com/qmuntal/gltf"
)

// GLB container constants (glTF 2.0 binary format, §Binary glTF layout).
// Unexported in qmuntal/gltf, so spelled out here.
const (
	glbMagic       = 0x46546C67 // "glTF"
	glbJSONChunk   = 0x4E4F534A // "JSON"
	glbHeaderLen   = 12
	chunkHeaderLen = 8
)

// glbStats reads a produced GLB's accessor counts — how many positions it
// holds and how many triangles it draws. Only the glTF JSON chunk is parsed,
// by hand, straight out of the GLB container — never through
// gltf.Decoder.Decode, which also reads every buffer's bytes. gltfpack's
// meshopt-compressed output (the default LOD pass) declares a second
// "fallback" buffer with a byteLength but no data (EXT_meshopt_compression),
// which a compliant reader is meant to skip but which Decode rejects as
// "buffer without URI". Accessor counts live entirely in the JSON chunk, so
// none of that matters here: nothing is decoded and the cost is independent
// of the mesh's size.
//
// A primitive with an index buffer draws indices/3 triangles; one without
// draws its positions in threes.
func glbStats(body []byte) (vertices, faces uint64, err error) {
	raw, err := glbJSON(body)
	if err != nil {
		return 0, 0, fmt.Errorf("glbStats: %w", err)
	}
	var doc gltf.Document
	if err := json.Unmarshal(raw, &doc); err != nil {
		return 0, 0, fmt.Errorf("glbStats: decode: %w", err)
	}
	// A decoder given arbitrary bytes can answer an empty document rather
	// than an error, and an artifact with no mesh is not something to record
	// counts for either way.
	if len(doc.Meshes) == 0 {
		return 0, 0, fmt.Errorf("glbStats: no meshes")
	}
	for _, mesh := range doc.Meshes {
		for _, p := range mesh.Primitives {
			pos, ok := p.Attributes[gltf.POSITION]
			if !ok || pos < 0 || pos >= len(doc.Accessors) {
				continue
			}
			count := uint64(doc.Accessors[pos].Count)
			vertices += count
			if p.Indices != nil && *p.Indices >= 0 && *p.Indices < len(doc.Accessors) {
				faces += uint64(doc.Accessors[*p.Indices].Count) / 3
				continue
			}
			faces += count / 3
		}
	}
	return vertices, faces, nil
}

// glbJSON extracts the first ("JSON") chunk's raw bytes from a binary glTF
// container, without touching anything after it — the BIN chunk holding the
// actual geometry is never read.
func glbJSON(body []byte) ([]byte, error) {
	if len(body) < glbHeaderLen+chunkHeaderLen {
		return nil, fmt.Errorf("too short to be a GLB (%d bytes)", len(body))
	}
	if magic := binary.LittleEndian.Uint32(body[0:4]); magic != glbMagic {
		return nil, fmt.Errorf("not a GLB: bad magic %#x", magic)
	}
	chunkLen := binary.LittleEndian.Uint32(body[12:16])
	chunkType := binary.LittleEndian.Uint32(body[16:20])
	if chunkType != glbJSONChunk {
		return nil, fmt.Errorf("first chunk is not JSON: type %#x", chunkType)
	}
	start := glbHeaderLen + chunkHeaderLen
	end := start + int(chunkLen)
	if end > len(body) {
		return nil, fmt.Errorf("JSON chunk (%d bytes) exceeds body length (%d)", chunkLen, len(body))
	}
	return body[start:end], nil
}
