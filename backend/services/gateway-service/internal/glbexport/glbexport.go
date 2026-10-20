// Package glbexport merges a territory GLB and the GLBs of its placed models
// into one GLB. It is pure: it plans from each blob's head (glTF JSON plus the
// position of its BIN chunk) and then copies the BIN bytes through an Opener,
// so memory stays independent of mesh size.
//
// Only what gltfpack emits is understood. Anything else fails with
// ErrUnsupported instead of producing a file that opens wrongly.
package glbexport

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/qmuntal/gltf"
)

var (
	ErrMalformed   = errors.New("glbexport: malformed glb")
	ErrUnsupported = errors.New("glbexport: unsupported glTF feature")
	ErrTooLarge    = errors.New("glbexport: export exceeds 4 GiB")
)

const (
	glbMagic    = 0x46546C67 // "glTF"
	glbVersion  = 2
	chunkJSON   = 0x4E4F534A // "JSON"
	chunkBIN    = 0x004E4942 // "BIN\0"
	headerSize  = 12         // magic, version, length
	chunkHeader = 8          // length, type

	// maxJSONChunk bounds the JSON read from one input, against a corrupt blob.
	maxJSONChunk = 64 << 20
)

// Opener returns the blob's bytes from offset to its end. Callers read what
// they need and Close.
type Opener func(ctx context.Context, hash string, offset int64) (io.ReadCloser, error)

// Head is what Build needs of one input GLB.
type Head struct {
	Doc       *gltf.Document
	BinOffset int64 // file offset of the BIN chunk's data
	BinLength int64 // BIN chunk length as declared; 0 when there is no BIN chunk
}

// Placement is one node of the output scene: a blob and where it stands.
type Placement struct {
	Hash        string // LOD0 blob hash
	Name        string
	Translation [3]float64
	Rotation    [3]float64 // Euler XYZ, radians
	Scale       [3]float64
}

// Segment is a run of one input's BIN bytes inside the output BIN.
type Segment struct {
	Hash      string
	Offset    int64 // = Head.BinOffset of that blob
	Length    int64 // = Head.BinLength
	OutOffset int64 // 4-aligned start inside the output BIN data
}

// Plan is everything Write needs; Size is the exact length of the output.
type Plan struct {
	JSON      []byte // padded with spaces to 4
	BinLength int64  // padded with zeros to 4; 0 means no BIN chunk is written
	Segments  []Segment
	Size      int64 // 12 + 8 + len(JSON) + (8 + BinLength if BinLength > 0)
}

func malformed(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrMalformed, fmt.Sprintf(format, args...))
}

func unsupported(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrUnsupported, fmt.Sprintf(format, args...))
}
