package glbexport

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"testing"

	"github.com/qmuntal/gltf"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type WriteSuite struct{ suite.Suite }

func TestWriteSuite(t *testing.T) { suite.Run(t, new(WriteSuite)) }

// inMemory opens a blob as a reader from the offset, like asset-service's Range.
func inMemory(blobs map[string][]byte) Opener {
	return func(_ context.Context, hash string, offset int64) (io.ReadCloser, error) {
		b, ok := blobs[hash]
		if !ok {
			return nil, errors.New("no such blob")
		}
		return io.NopCloser(bytes.NewReader(b[offset:])), nil
	}
}

// export plans territory + models and returns the plan, the blobs and the heads' opener.
func (s *WriteSuite) export(models ...string) (Plan, map[string][]byte) {
	fixtures := map[string]fixture{"t": triangleDoc, "q": texturedQuadDoc, "m": meshoptDoc}
	blobs := map[string][]byte{}
	heads := map[string]Head{}
	ps := []Placement{place("t", "terrain")}
	for _, hash := range append([]string{"t"}, models...) {
		doc, bin := fixtures[hash]()
		blobs[hash] = makeGLB(s.T(), doc, bin)
		h, err := ReadHead(bytes.NewReader(blobs[hash]))
		assert.NilError(s.T(), err)
		heads[hash] = h
		if hash != "t" {
			ps = append(ps, place(hash, hash))
		}
	}
	plan, err := Build(ps, heads)
	assert.NilError(s.T(), err)
	return plan, blobs
}

func (s *WriteSuite) TestOutputDecodes() {
	plan, blobs := s.export("q")

	var out bytes.Buffer
	assert.NilError(s.T(), Write(s.T().Context(), &out, plan, inMemory(blobs)))

	assert.Equal(s.T(), int64(out.Len()), plan.Size)
	assert.Equal(s.T(), int64(binary.LittleEndian.Uint32(out.Bytes()[8:12])), plan.Size)
	assert.NilError(s.T(), gltf.NewDecoder(bytes.NewReader(out.Bytes())).Decode(new(gltf.Document)))
}

func (s *WriteSuite) TestBinIsSegmentsWithZeroPadding() {
	plan, blobs := s.export("m", "q")

	var out bytes.Buffer
	assert.NilError(s.T(), Write(s.T().Context(), &out, plan, inMemory(blobs)))

	b := out.Bytes()
	jsonLen := int64(binary.LittleEndian.Uint32(b[12:16]))
	bin := b[20+jsonLen+8:]
	assert.Equal(s.T(), int64(len(bin)), plan.BinLength)
	assert.DeepEqual(s.T(), bin[:42], binOf(42, 1))
	assert.DeepEqual(s.T(), bin[42:44], []byte{0, 0}) // the triangle's BIN is unpadded
	assert.DeepEqual(s.T(), bin[44:84], binOf(40, 50))
	assert.DeepEqual(s.T(), bin[84:84+108], binOf(108, 100))

	doc := new(gltf.Document)
	assert.NilError(s.T(), json.Unmarshal(b[20:20+jsonLen], doc))
	checkIndices(s.T(), doc, int64(len(bin)))
}

func (s *WriteSuite) TestStopsOnOpenerFailure() {
	plan, blobs := s.export("q")
	delete(blobs, "q")

	var out bytes.Buffer
	err := Write(s.T().Context(), &out, plan, inMemory(blobs))

	assert.ErrorContains(s.T(), err, "blob q")
	assert.Assert(s.T(), int64(out.Len()) < plan.Size)
}

func (s *WriteSuite) TestShortSourceIsAnError() {
	plan, blobs := s.export("q")
	blobs["q"] = blobs["q"][:len(blobs["q"])-10]

	var out bytes.Buffer
	err := Write(s.T().Context(), &out, plan, inMemory(blobs))

	assert.ErrorIs(s.T(), err, io.ErrUnexpectedEOF)
	assert.Assert(s.T(), int64(out.Len()) < plan.Size)
}

func (s *WriteSuite) TestStopsOnCancelledContext() {
	plan, blobs := s.export("q")
	ctx, cancel := context.WithCancel(s.T().Context())
	cancel()

	err := Write(ctx, io.Discard, plan, inMemory(blobs))

	assert.ErrorIs(s.T(), err, context.Canceled)
}
