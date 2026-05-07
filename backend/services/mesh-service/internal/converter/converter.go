// Package converter turns source meshes (OBJ today, more later) into binary
// glTF (GLB) artifacts. The Convert pipeline is parse → normalize → write
// GLB → optional Draco/KTX2 post-processing → optional LOD generation.
//
// Compression and LOD simplification are injected so unit tests run without
// an external `gltfpack` binary on the test host.
package converter

import (
	"context"
)

// Compressor post-processes a GLB blob (typically gltfpack-driven Draco +
// KTX2 + LOD simplification). Optional — when nil or omitted, Convert
// returns the raw GLB and ConvertLODs returns just LOD0.
type Compressor interface {
	Compress(ctx context.Context, glb []byte) ([]byte, error)
	Simplify(ctx context.Context, glb []byte, ratio float64) ([]byte, error)
}

// Converter is stateless aside from optional injected dependencies.
type Converter struct {
	compressor Compressor
	lodRatios  []float64
}

// Option mutates a Converter at construction. Functional options keep the
// public surface stable as more knobs (KTX2, future formats) land later.
type Option func(*Converter)

// WithCompressor injects an optional GLB post-processor (gltfpack-backed).
func WithCompressor(c Compressor) Option {
	return func(cv *Converter) { cv.compressor = c }
}

// WithLODRatios installs the simplification ratios used by ConvertLODs.
// Each ratio produces one additional LOD artifact (LOD1, LOD2, ...) from
// the same source. Empty slice = LOD0 only. Caller must ensure ratios are
// strictly in (0,1) and ordered descending (50% before 25%) for predictable
// LOD numbering.
func WithLODRatios(ratios []float64) Option {
	return func(cv *Converter) { cv.lodRatios = ratios }
}

// New constructs a Converter.
func New(opts ...Option) *Converter {
	cv := &Converter{}
	for _, opt := range opts {
		opt(cv)
	}
	return cv
}
