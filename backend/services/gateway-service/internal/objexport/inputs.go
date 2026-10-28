package objexport

import (
	"cmp"
	"errors"
	"fmt"
	"slices"

	"github.com/qmuntal/gltf"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

// input is one distinct blob, validated once however often it is placed.
type input struct {
	hash   string
	head   glbexport.Head
	doc    *gltf.Document
	mats   []string // output material name by doc.Materials index
	meshes map[int]*meshData
}

// checkDoc refuses what a plain GLB never carries, before any byte is written.
func checkDoc(doc *gltf.Document) error {
	if len(doc.ExtensionsUsed)+len(doc.ExtensionsRequired) > 0 {
		return unsupported("extensions %v", slices.Concat(doc.ExtensionsUsed, doc.ExtensionsRequired))
	}
	err := glbexport.Validate(doc)
	switch {
	case err == nil:
		return nil
	case errors.Is(err, glbexport.ErrMalformed):
		return fmt.Errorf("%w: %w", ErrMalformed, err)
	default:
		return fmt.Errorf("%w: %w", ErrUnsupported, err)
	}
}

// view returns bufferView i after checking it lies on buffer 0 inside the BIN.
func (in *input) view(i int) (*gltf.BufferView, error) {
	if i < 0 || i >= len(in.doc.BufferViews) {
		return nil, malformed("bufferView %d out of range [0, %d)", i, len(in.doc.BufferViews))
	}
	v := in.doc.BufferViews[i]
	if v.Buffer != 0 {
		return nil, unsupported("bufferView %d is on buffer %d", i, v.Buffer)
	}
	// The length is checked against the room left, so no sum can overflow.
	if v.ByteOffset < 0 || v.ByteLength < 0 || v.ByteStride < 0 ||
		int64(v.ByteOffset) > in.head.BinLength || int64(v.ByteLength) > in.head.BinLength-int64(v.ByteOffset) {
		return nil, malformed(
			"bufferView %d [%d,+%d) outside the %d-byte BIN",
			i,
			v.ByteOffset,
			v.ByteLength,
			in.head.BinLength,
		)
	}
	return v, nil
}

// accessor resolves accessor i, which must be of type typ and one of comps.
// Every range is checked here, so Write never touches a document.
func (in *input) accessor(i int, typ gltf.AccessorType, comps ...gltf.ComponentType) (accessor, error) {
	if i < 0 || i >= len(in.doc.Accessors) {
		return accessor{}, malformed("accessor %d out of range [0, %d)", i, len(in.doc.Accessors))
	}
	a := in.doc.Accessors[i]
	switch {
	case a.Type != typ || !slices.Contains(comps, a.ComponentType) || a.Normalized:
		return accessor{}, unsupported("accessor %d is %v %v (normalized %t)", i, a.ComponentType, a.Type, a.Normalized)
	case a.BufferView == nil:
		return accessor{}, unsupported("accessor %d has no bufferView", i)
	}
	v, err := in.view(*a.BufferView)
	if err != nil {
		return accessor{}, err
	}
	elem := gltf.SizeOfElement(a.ComponentType, a.Type)
	stride := cmp.Or(v.ByteStride, elem)
	// avail is the room for the last element's start, so no product overflows.
	avail := int64(v.ByteLength) - int64(a.ByteOffset) - int64(elem)
	if stride < elem || a.Count < 1 || a.ByteOffset < 0 || avail < 0 || int64(a.Count-1) > avail/int64(stride) {
		return accessor{}, malformed(
			"accessor %d: %d elements of %d bytes at stride %d do not fit its bufferView",
			i,
			a.Count,
			elem,
			stride,
		)
	}
	return accessor{
		off: in.head.BinOffset + int64(
			v.ByteOffset,
		) + int64(
			a.ByteOffset,
		),
		stride: stride,
		elem:   elem,
		count:  a.Count,
		comp:   a.ComponentType,
	}, nil
}

// resolveMesh resolves mesh i: its primitives' accessors, once per input.
func (in *input) resolveMesh(i int) (*meshData, error) {
	if m, ok := in.meshes[i]; ok {
		return m, nil
	}
	if i < 0 || i >= len(in.doc.Meshes) {
		return nil, malformed("mesh %d out of range [0, %d)", i, len(in.doc.Meshes))
	}
	md := new(meshData)
	posAt, uvAt := map[int]int{}, map[int]int{}
	for _, p := range in.doc.Meshes[i].Primitives {
		pr, err := in.primitive(md, p, posAt, uvAt)
		if err != nil {
			return nil, err
		}
		md.prims = append(md.prims, pr)
		md.faces += int64(pr.indices.count / 3)
	}
	for _, a := range md.pos {
		md.vertices += int64(a.count)
	}
	in.meshes[i] = md
	return md, nil
}

// primitive resolves one primitive, adding its accessors to md's distinct sets.
func (in *input) primitive(md *meshData, p *gltf.Primitive, posAt, uvAt map[int]int) (primitive, error) {
	switch {
	case p.Mode != gltf.PrimitiveTriangles:
		return primitive{}, unsupported("primitive mode %v", p.Mode)
	case p.Indices == nil:
		return primitive{}, unsupported("primitive without indices")
	case len(p.Targets) > 0:
		return primitive{}, unsupported("morph targets")
	}
	pos, ok := p.Attributes["POSITION"]
	if !ok {
		return primitive{}, malformed("primitive without POSITION")
	}
	pa, err := in.accessor(pos, gltf.AccessorVec3, gltf.ComponentFloat)
	if err != nil {
		return primitive{}, err
	}
	idx, err := in.accessor(
		*p.Indices,
		gltf.AccessorScalar,
		gltf.ComponentUbyte,
		gltf.ComponentUshort,
		gltf.ComponentUint,
	)
	if err != nil {
		return primitive{}, err
	}
	if idx.count%3 != 0 {
		return primitive{}, malformed("index count %d is not a multiple of 3", idx.count)
	}
	pr := primitive{pos: distinct(&md.pos, posAt, pos, pa), uv: -1, indices: idx, mtl: "default"}
	if uv, ok := p.Attributes["TEXCOORD_0"]; ok {
		ua, err := in.accessor(uv, gltf.AccessorVec2, gltf.ComponentFloat)
		if err != nil {
			return primitive{}, err
		}
		if ua.count != pa.count {
			return primitive{}, malformed("TEXCOORD_0 has %d elements, POSITION %d", ua.count, pa.count)
		}
		pr.uv = distinct(&md.uvs, uvAt, uv, ua)
	}
	switch {
	case p.Material == nil:
		md.usesDefault = true
	case *p.Material < 0 || *p.Material >= len(in.mats):
		return primitive{}, malformed("material %d out of range [0, %d)", *p.Material, len(in.mats))
	default:
		pr.mtl = in.mats[*p.Material]
	}
	return pr, nil
}

// distinct returns accessor i's slot in set, adding a on first sight.
func distinct(set *[]accessor, at map[int]int, i int, a accessor) int {
	if n, ok := at[i]; ok {
		return n
	}
	at[i] = len(*set)
	*set = append(*set, a)
	return at[i]
}
