package glbexport

import (
	"encoding/json"
	"fmt"
	"maps"
	"math"
	"slices"

	"github.com/qmuntal/gltf"
)

const (
	generator = "rosneft territory export"

	// maxNodes bounds the output's nodes: every placement copies its blob's
	// node tree, so placements × nodes would grow the JSON without limit.
	maxNodes = 1 << 18
)

// instance is one input GLB after its resources went into the output: the
// pieces a placement needs to copy that GLB's node tree.
type instance struct {
	src      *gltf.Document
	roots    []int
	meshBase int
}

type builder struct {
	doc      gltf.Document
	binLen   int // end of the last segment, before alignment
	segments []Segment
	insts    map[string]*instance
	used     map[string]bool
	required map[string]bool
}

func align4(n int) int { return (n + 3) &^ 3 }

// Build merges the inputs into one document. The first placement is the
// territory by convention, the rest follow in order; every distinct hash
// contributes its resources once, in first-appearance order.
func Build(placements []Placement, heads map[string]Head) (Plan, error) {
	b := &builder{insts: map[string]*instance{}, used: map[string]bool{}, required: map[string]bool{}}
	b.doc.Buffers = []*gltf.Buffer{{}} // buffer 0: the output BIN, sized in plan
	b.doc.Scenes = []*gltf.Scene{{}}
	insts := make([]*instance, len(placements))
	nodes := 0
	for i, p := range placements {
		in, err := b.instance(p.Hash, heads)
		if err != nil {
			return Plan{}, err
		}
		insts[i] = in
		nodes += 1 + len(in.src.Nodes) // upper bound: the placement node and every input node
	}
	if nodes > maxNodes {
		return Plan{}, fmt.Errorf("%w: up to %d nodes, limit %d", ErrTooLarge, nodes, maxNodes)
	}
	for i, p := range placements {
		if err := b.addPlacement(insts[i], p); err != nil {
			return Plan{}, fmt.Errorf("glbexport: placement %q: %w", p.Name, err)
		}
	}
	return b.plan()
}

func (b *builder) instance(hash string, heads map[string]Head) (*instance, error) {
	if in, ok := b.insts[hash]; ok {
		return in, nil
	}
	h, ok := heads[hash]
	if !ok {
		return nil, fmt.Errorf("glbexport: no head for blob %s", hash)
	}
	in, err := b.addDoc(hash, h)
	if err != nil {
		return nil, fmt.Errorf("glbexport: blob %s: %w", hash, err)
	}
	b.insts[hash] = in
	return in, nil
}

// plan fixes the BIN size, writes the document and frames the sizes.
func (b *builder) plan() (Plan, error) {
	binLen := align4(b.binLen)
	if binLen == 0 {
		return Plan{}, malformed("no binary data")
	}
	b.doc.Buffers[0].ByteLength = binLen
	b.doc.Asset = gltf.Asset{Version: "2.0", Generator: generator}
	b.doc.Scene = new(0)
	for name := range b.required {
		b.used[name] = true
	}
	b.doc.ExtensionsUsed = slices.Sorted(maps.Keys(b.used))
	b.doc.ExtensionsRequired = slices.Sorted(maps.Keys(b.required))

	js, err := json.Marshal(&b.doc)
	if err != nil {
		return Plan{}, fmt.Errorf("glbexport: marshal: %w", err)
	}
	for len(js)%4 != 0 {
		js = append(js, ' ')
	}
	size := int64(headerSize+chunkHeader+len(js)+chunkHeader) + int64(binLen)
	if size > math.MaxUint32 {
		return Plan{}, ErrTooLarge
	}
	return Plan{JSON: js, BinLength: int64(binLen), Segments: b.segments, Size: size}, nil
}
