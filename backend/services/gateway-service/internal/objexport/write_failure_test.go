package objexport

import (
	"bytes"
	"context"
	"errors"
	"fmt"

	"github.com/qmuntal/gltf"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

// errDiskFull is what a failing destination returns.
var errDiskFull = errors.New("disk full")

// failAfter accepts n bytes, then refuses every write.
type failAfter struct{ left int }

func (f *failAfter) Write(p []byte) (int, error) {
	if len(p) > f.left {
		n := f.left
		f.left = 0
		return n, errDiskFull
	}
	f.left -= len(p)
	return len(p), nil
}

// bulkyPlan is a plan whose MTL (6000 materials) and image (300 kB of
// pseudo-random bytes) are each far larger than the ZIP's write buffer, so a
// destination that fails part-way fails inside each of the entries in turn.
func (s *WriteSuite) bulkyPlan() (Plan, *source) {
	doc, bin := docOf(tri(corners...))
	bin = align4(bin)
	img := make([]byte, 300_000)
	seed := uint32(1)
	for i := range img {
		seed = seed*1664525 + 1013904223
		img[i] = byte(seed >> 24)
	}
	doc.BufferViews = append(doc.BufferViews, &gltf.BufferView{ByteOffset: len(bin), ByteLength: len(img)})
	bin = append(bin, img...)
	doc.Images = append(doc.Images, &gltf.Image{
		Name: "a.png", MimeType: "image/png", BufferView: new(len(doc.BufferViews) - 1),
	})
	doc.Textures = append(doc.Textures, &gltf.Texture{Source: new(0)})
	doc.Buffers[0].ByteLength = len(bin)
	doc.Meshes[0].Primitives[0].Material = new(withMaterial(doc, "first", 0, [4]float64{1, 1, 1, 1}))
	for i := range 6_000 {
		withMaterial(doc, fmt.Sprintf("material-%d", i), -1, [4]float64{1, 1, 1, 1})
	}
	blob := glbOf(s.T(), doc, bin)
	heads := map[string]glbexport.Head{"m": headOf(s.T(), blob)}
	plan, err := Build([]glbexport.Placement{place("m", "one")}, heads, testOpts())
	assert.NilError(s.T(), err)
	return plan, &source{blobs: map[string][]byte{"m": blob}}
}

// A destination that dies part-way is reported by the entry it died in.
func (s *WriteSuite) TestDestinationFailureNamesTheEntry() {
	plan, src := s.bulkyPlan()
	var full bytes.Buffer
	assert.NilError(s.T(), Write(s.T().Context(), &full, plan, src.open))

	seen := map[string]bool{}
	for limit := 0; limit < full.Len(); limit += 4001 {
		err := Write(s.T().Context(), &failAfter{limit}, plan, src.open)

		assert.ErrorIs(s.T(), err, errDiskFull, "limit %d", limit)
		seen[err.Error()] = true
	}
	// The image's header fails only in the few bytes where the MTL's last
	// block is flushed, which a sweep this coarse may step over: it is allowed
	// but not required, and so is a failure of the
	// last flush.
	allowed := map[string]bool{
		"disk full":                              true, // only the central directory was left
		"objexport: image t000_a.png: disk full": true,
		"objexport: t000_a.png: disk full":       true,
		"objexport: ust-kut.mtl: disk full":      true,
		"objexport: ust-kut.obj: disk full":      true,
	}
	for m := range seen {
		assert.Assert(s.T(), allowed[m], "unexpected %q", m)
	}
	for _, m := range []string{
		"objexport: image t000_a.png: disk full",
		"objexport: ust-kut.mtl: disk full",
		"objexport: ust-kut.obj: disk full",
	} {
		assert.Assert(s.T(), seen[m], "never saw %q", m)
	}
}

// A destination with room for everything but the end fails Close, unwrapped.
func (s *WriteSuite) TestEveryEntryFitsButTheDirectoryFails() {
	plan, src := s.bulkyPlan()
	var full bytes.Buffer
	assert.NilError(s.T(), Write(s.T().Context(), &full, plan, src.open))

	err := Write(s.T().Context(), &failAfter{full.Len() - 1}, plan, src.open)

	assert.Error(s.T(), err, "disk full")
}

// countdown is a context that reports Canceled from its n-th Err call on.
type countdown struct {
	context.Context
	left  int
	calls int
}

func (c *countdown) Err() error {
	c.calls++
	if c.calls >= c.left {
		return context.Canceled
	}
	return nil
}

// The context is consulted before each open: cancelled at any of those points
// the export stops with Canceled, and one asked fewer times than that is not.
func (s *WriteSuite) TestEveryContextCheckStops() {
	plan, src := s.bulkyPlan()
	probe := &countdown{Context: s.T().Context(), left: 1 << 30}
	assert.NilError(s.T(), Write(probe, &bytes.Buffer{}, plan, src.open))
	checks := probe.calls
	assert.Assert(s.T(), checks >= 3, "checks %d", checks)

	for n := 1; n <= checks; n++ {
		err := Write(&countdown{Context: s.T().Context(), left: n}, &bytes.Buffer{}, plan, src.open)

		assert.ErrorIs(s.T(), err, context.Canceled, "cancelled at check %d", n)
	}
}
