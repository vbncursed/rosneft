// Package compression post-processes GLB artifacts produced by the
// converter. It shells out to `gltfpack` (zeux/meshoptimizer) and applies a
// configurable set of optimisations:
//
//   - Draco mesh compression (KHR_draco_mesh_compression)
//   - KTX2 / Basis Universal textures (KHR_texture_basisu)
//
// Each is opt-in via a functional option so frontends can enable features
// only after their decoders/loaders are wired. One method per file:
// compression.go owns the contract + constructor, compress.go does the
// transformation, available.go runs the startup preflight.
package compression

import "context"

// Compressor is the contract consumed by the converter. Nil/no-op is
// acceptable when no post-processing is configured — callers must check.
type Compressor interface {
	Compress(ctx context.Context, glb []byte) ([]byte, error)
}

// Optimizer post-processes GLB payloads via the external `gltfpack` binary.
// The set of optimisations applied is selected by functional options at
// construction.
type Optimizer struct {
	binPath string
	draco   bool
	ktx2    bool
}

// Option mutates an Optimizer at construction.
type Option func(*Optimizer)

// WithDraco enables KHR_draco_mesh_compression. The frontend must register
// a DRACOLoader to decode the output.
func WithDraco() Option {
	return func(o *Optimizer) { o.draco = true }
}

// WithKTX2 enables KHR_texture_basisu (KTX2 / Basis Universal). The
// frontend must register a KTX2Loader. Slow on the encoder side — a single
// large texture can take seconds — but worth it for VRAM-bound clients.
func WithKTX2() Option {
	return func(o *Optimizer) { o.ktx2 = true }
}

// New constructs an Optimizer.
//
// binPath is either an absolute path to gltfpack or a name resolved against
// $PATH (e.g. "gltfpack"). Empty falls back to "gltfpack".
func New(binPath string, opts ...Option) *Optimizer {
	if binPath == "" {
		binPath = "gltfpack"
	}
	o := &Optimizer{binPath: binPath}
	for _, opt := range opts {
		opt(o)
	}
	return o
}

// HasOptimisations reports whether at least one optimisation pass is
// enabled. Bootstrap uses this to decide whether to wire the optimiser
// into the converter at all.
func (o *Optimizer) HasOptimisations() bool {
	return o.draco || o.ktx2
}
