package glbexport

import (
	"encoding/json"
	"maps"
	"math"

	"github.com/qmuntal/gltf"
)

// meshoptPayload is the EXT_meshopt_compression value of a bufferView: where
// the compressed bytes are (buffer, byteOffset), not where the decoded ones go.
type meshoptPayload struct {
	Buffer     int    `json:"buffer"`
	ByteOffset int    `json:"byteOffset,omitzero"`
	ByteLength int    `json:"byteLength"`
	ByteStride int    `json:"byteStride"`
	Count      int    `json:"count"`
	Mode       string `json:"mode"`
	Filter     string `json:"filter,omitempty"`
}

// remap moves one input document into the output: every array it owns is
// appended, and every index into those arrays shifts by the output's length
// at that moment. The first error sticks and later calls become no-ops.
type remap struct {
	err    error
	src    *gltf.Document
	out    *gltf.Document
	head   Head
	base   int   // where this input's BIN starts in the output BIN
	bufMap []int // input buffer -> output buffer

	acc, bv, img, smp, tex, mat, mesh int // output array lengths before this input
}

func (r *remap) fail(err error) {
	if r.err == nil {
		r.err = err
	}
}

// at checks i against an array of n elements and returns i shifted by base.
func (r *remap) at(i, n, base int, what string) int {
	if i < 0 || i >= n {
		r.fail(malformed("%s %d out of range [0, %d)", what, i, n))
	}
	return i + base
}

func (r *remap) opt(p *int, n, base int, what string) *int {
	if p == nil {
		return nil
	}
	return new(r.at(*p, n, base, what))
}

func (r *remap) bufferView(p *int) *int {
	return r.opt(p, len(r.src.BufferViews), r.bv, "bufferView")
}

// buffer maps an input buffer index to the output's.
func (r *remap) buffer(i int) int {
	r.at(i, len(r.bufMap), 0, "buffer")
	if r.err != nil {
		return 0
	}
	return r.bufMap[i]
}

// addDoc validates one input, reserves its BIN segment and appends its resources.
func (b *builder) addDoc(hash string, h Head) (*instance, error) {
	src := h.Doc
	if src == nil {
		return nil, malformed("no document")
	}
	if err := Validate(src); err != nil {
		return nil, err
	}
	roots, err := SceneRoots(src)
	if err != nil {
		return nil, err
	}
	base := align4(b.binLen)
	if h.BinLength < 0 || h.BinLength > math.MaxUint32-int64(base) {
		return nil, ErrTooLarge
	}
	if h.BinLength > 0 {
		b.segments = append(b.segments, Segment{Hash: hash, Offset: h.BinOffset, Length: h.BinLength, OutOffset: int64(base)})
		b.binLen = base + int(h.BinLength)
	}

	out := &b.doc
	r := &remap{
		src: src, out: out, head: h, base: base, bufMap: make([]int, len(src.Buffers)),
		acc: len(out.Accessors), bv: len(out.BufferViews), img: len(out.Images), smp: len(out.Samplers),
		tex: len(out.Textures), mat: len(out.Materials), mesh: len(out.Meshes),
	}
	r.buffers()
	r.bufferViews()
	r.accessors()
	r.images()
	out.Samplers = append(out.Samplers, src.Samplers...)
	r.textures()
	r.materials()
	r.meshes()
	if r.err != nil {
		return nil, r.err
	}
	for _, name := range src.ExtensionsUsed {
		b.used[name] = true
	}
	for _, name := range src.ExtensionsRequired {
		b.required[name] = true
	}
	return &instance{src: src, roots: roots, meshBase: r.mesh}, nil
}

// buffers: input buffer 0 is the GLB BIN and becomes output buffer 0; any
// other (validated: a meshopt fallback) is appended as its own buffer.
func (r *remap) buffers() {
	for i, buf := range r.src.Buffers {
		if i == 0 {
			continue
		}
		r.bufMap[i] = len(r.out.Buffers)
		r.out.Buffers = append(r.out.Buffers, &gltf.Buffer{ByteLength: buf.ByteLength, Extensions: maps.Clone(buf.Extensions)})
	}
}

func (r *remap) bufferViews() {
	for _, in := range r.src.BufferViews {
		v := *in
		v.Buffer = r.buffer(in.Buffer)
		if in.Buffer == 0 {
			r.inBin(&v.ByteOffset, v.ByteLength, "bufferView")
		}
		v.Extensions = r.meshopt(in.Extensions)
		r.out.BufferViews = append(r.out.BufferViews, &v)
	}
}

// inBin checks that [*off, *off+length) lies inside the input's BIN and moves
// it to where that BIN starts in the output.
func (r *remap) inBin(off *int, length int, what string) {
	// length is compared with the remainder: *off+length can wrap int64.
	if *off < 0 || length < 0 || int64(*off) > r.head.BinLength || int64(length) > r.head.BinLength-int64(*off) {
		r.fail(malformed("%s [%d,+%d) outside the %d-byte BIN", what, *off, length, r.head.BinLength))
	}
	*off += r.base
}

// meshopt remaps the compressed payload a bufferView points at. Its own
// byteOffset moves with the BIN when the payload is on buffer 0 — the easy
// one to miss, since the view itself sits on the fallback buffer.
func (r *remap) meshopt(ext gltf.Extensions) gltf.Extensions {
	raw, ok := ext[extMeshopt]
	if !ok {
		return ext
	}
	data, isRaw := raw.(json.RawMessage)
	var p meshoptPayload
	if !isRaw {
		r.fail(malformed("meshopt payload is not JSON"))
		return ext
	}
	if err := json.Unmarshal(data, &p); err != nil {
		r.fail(malformed("meshopt payload: %v", err))
		return ext
	}
	src := p.Buffer
	p.Buffer = r.buffer(src)
	if r.err == nil && src == 0 {
		r.inBin(&p.ByteOffset, p.ByteLength, "meshopt payload")
	}
	enc, err := json.Marshal(p)
	if err != nil {
		r.fail(malformed("meshopt payload: %v", err))
		return ext
	}
	out := maps.Clone(ext)
	out[extMeshopt] = json.RawMessage(enc)
	return out
}

func (r *remap) accessors() {
	for _, in := range r.src.Accessors {
		a := *in
		a.BufferView = r.bufferView(in.BufferView)
		r.out.Accessors = append(r.out.Accessors, &a)
	}
}

func (r *remap) images() {
	for _, in := range r.src.Images {
		im := *in
		im.BufferView = r.bufferView(in.BufferView)
		r.out.Images = append(r.out.Images, &im)
	}
}
