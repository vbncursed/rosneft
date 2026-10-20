// Package objexport bakes a territory and its placed models into one OBJ
// inside a ZIP: README.txt, the MTL, the source textures and the OBJ, with
// every placement's transform applied to its vertices (Z up, Y forward,
// metres as the viewer measures them).
//
// It is pure, in glbexport's shape: Build plans from the plain GLBs' heads
// with no I/O, and Write streams the archive through an Opener, so memory is
// buffers, never the scene.
package objexport

import (
	"errors"
	"fmt"
	"time"

	"github.com/qmuntal/gltf"
)

// The ceilings on the baked totals; Build refuses a scene over either.
const (
	MaxVertices = 20_000_000
	MaxFaces    = 40_000_000

	maxNodes = 1 << 18 // placement x input nodes, glbexport's bound
	maxDepth = 256     // an input's node tree
	maxToken = 48      // bytes of a name inside a file name
)

var (
	ErrMalformed   = errors.New("objexport: malformed glb")
	ErrUnsupported = errors.New("objexport: unsupported glTF feature")
	ErrTooLarge    = errors.New("objexport: export exceeds the OBJ ceilings")
)

func malformed(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrMalformed, fmt.Sprintf(format, args...))
}

func unsupported(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrUnsupported, fmt.Sprintf(format, args...))
}

// Options configures Build.
type Options struct {
	Stem     string    // raw slug; Build reduces it to a token
	Ratio    float64   // scene unit -> metres; 1 when !Metric
	Metric   bool      // Ratio is the real scene-unit-to-metre ratio
	Modified time.Time // every ZIP entry's mtime
}

// accessor is a resolved glTF accessor: where its elements sit in the blob.
type accessor struct {
	off    int64 // blob offset of element 0
	stride int   // bytes between elements
	elem   int   // bytes of one element
	count  int
	comp   gltf.ComponentType
}

type primitive struct {
	pos, uv int // indices into meshData.pos / uvs; uv is -1 without UVs
	indices accessor
	mtl     string // the usemtl name
}

// meshData is a mesh with its distinct POSITION and TEXCOORD_0 accessors.
type meshData struct {
	pos, uvs    []accessor
	prims       []primitive
	vertices    int64 // sum of the distinct POSITION counts
	faces       int64
	usesDefault bool
}

// instance is one mesh-node of one placement: f bakes a point from the mesh's
// scene space to the OBJ, flip reverses the winding.
type instance struct {
	mesh *meshData
	f    mat4
	flip bool
}

type object struct {
	name      string
	hash      string
	instances []instance
}

type imageRef struct {
	name        string
	hash        string
	off, length int64
}

// Plan is everything Write needs.
type Plan struct {
	stem     string
	readme   string
	header   string
	mtl      string
	images   []imageRef
	objects  []object
	modified time.Time
}
