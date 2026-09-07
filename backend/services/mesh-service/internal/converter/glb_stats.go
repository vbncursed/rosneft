package converter

import (
	"bytes"
	"fmt"

	"github.com/qmuntal/gltf"
)

// glbStats reads a produced GLB's accessor counts — how many positions it
// holds and how many triangles it draws. Only the glTF JSON header is
// parsed: accessor counts survive Draco compression and KTX2 textures, so
// nothing is decoded and the cost is independent of the mesh's size.
//
// A primitive with an index buffer draws indices/3 triangles; one without
// draws its positions in threes.
func glbStats(body []byte) (vertices, faces uint64, err error) {
	doc := new(gltf.Document)
	if err := gltf.NewDecoder(bytes.NewReader(body)).Decode(doc); err != nil {
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
