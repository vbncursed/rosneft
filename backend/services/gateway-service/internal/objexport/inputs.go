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
	a, err := in.accessorDef(i, typ, comps)
	if err != nil {
		return accessor{}, err
	}
	v, err := in.view(*a.BufferView)
	if err != nil {
		return accessor{}, err
	}
	elem := gltf.SizeOfElement(a.ComponentType, a.Type)
	stride := cmp.Or(v.ByteStride, elem)
	if !fitsView(a, v, elem, stride) {
		return accessor{}, malformed(
			"accessor %d: %d elements of %d bytes at stride %d do not fit its bufferView",
			i,
			a.Count,
			elem,
			stride,
		)
	}
	off := in.head.BinOffset + int64(v.ByteOffset) + int64(a.ByteOffset)
	return accessor{off: off, stride: stride, elem: elem, count: a.Count, comp: a.ComponentType}, nil
}

// accessorDef returns accessor i after the checks that need no bufferView:
// in range, of type typ, one of comps, not normalized, backed by a view.
func (in *input) accessorDef(i int, typ gltf.AccessorType, comps []gltf.ComponentType) (*gltf.Accessor, error) {
	if i < 0 || i >= len(in.doc.Accessors) {
		return nil, malformed("accessor %d out of range [0, %d)", i, len(in.doc.Accessors))
	}
	a := in.doc.Accessors[i]
	switch {
	case a.Type != typ || !slices.Contains(comps, a.ComponentType) || a.Normalized:
		return nil, unsupported("accessor %d is %v %v (normalized %t)", i, a.ComponentType, a.Type, a.Normalized)
	case a.BufferView == nil:
		return nil, unsupported("accessor %d has no bufferView", i)
	}
	return a, nil
}

// fitsView reports whether all of a's elements lie inside its view v.
func fitsView(a *gltf.Accessor, v *gltf.BufferView, elem, stride int) bool {
	// avail is the room for the last element's start, so no product overflows.
	avail := int64(v.ByteLength) - int64(a.ByteOffset) - int64(elem)
	return stride >= elem && a.Count >= 1 && a.ByteOffset >= 0 && avail >= 0 && int64(a.Count-1) <= avail/int64(stride)
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
	if err := checkPrimitiveSupported(p); err != nil {
		return primitive{}, err
	}
	pos, ok := p.Attributes["POSITION"]
	if !ok {
		return primitive{}, malformed("primitive without POSITION")
	}
	pa, err := in.accessor(pos, gltf.AccessorVec3, gltf.ComponentFloat)
	if err != nil {
		return primitive{}, err
	}
	idx, err := in.triangleIndices(*p.Indices)
	if err != nil {
		return primitive{}, err
	}
	pr := primitive{pos: distinct(&md.pos, posAt, pos, pa), uv: -1, indices: idx}
	if uv, ok := p.Attributes["TEXCOORD_0"]; ok {
		ua, err := in.texcoords(uv, pa.count)
		if err != nil {
			return primitive{}, err
		}
		pr.uv = distinct(&md.uvs, uvAt, uv, ua)
	}
	if pr.mtl, err = in.material(md, p.Material); err != nil {
		return primitive{}, err
	}
	return pr, nil
}

// checkPrimitiveSupported refuses the primitives a plain OBJ cannot carry.
func checkPrimitiveSupported(p *gltf.Primitive) error {
	switch {
	case p.Mode != gltf.PrimitiveTriangles:
		return unsupported("primitive mode %v", p.Mode)
	case p.Indices == nil:
		return unsupported("primitive without indices")
	case len(p.Targets) > 0:
		return unsupported("morph targets")
	}
	return nil
}

// triangleIndices resolves the index accessor, whose count must be whole triangles.
func (in *input) triangleIndices(i int) (accessor, error) {
	idx, err := in.accessor(
		i,
		gltf.AccessorScalar,
		gltf.ComponentUbyte,
		gltf.ComponentUshort,
		gltf.ComponentUint,
	)
	if err != nil {
		return accessor{}, err
	}
	if idx.count%3 != 0 {
		return accessor{}, malformed("index count %d is not a multiple of 3", idx.count)
	}
	return idx, nil
}

// texcoords resolves the TEXCOORD_0 accessor, one UV per position.
func (in *input) texcoords(i, positions int) (accessor, error) {
	ua, err := in.accessor(i, gltf.AccessorVec2, gltf.ComponentFloat)
	if err != nil {
		return accessor{}, err
	}
	if ua.count != positions {
		return accessor{}, malformed("TEXCOORD_0 has %d elements, POSITION %d", ua.count, positions)
	}
	return ua, nil
}

// material names the output material of a primitive; none means "default",
// which md remembers so the writer emits it.
func (in *input) material(md *meshData, m *int) (string, error) {
	switch {
	case m == nil:
		md.usesDefault = true
		return "default", nil
	case *m < 0 || *m >= len(in.mats):
		return "", malformed("material %d out of range [0, %d)", *m, len(in.mats))
	}
	return in.mats[*m], nil
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
