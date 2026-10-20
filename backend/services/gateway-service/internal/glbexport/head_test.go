package glbexport

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

func bytesReader(b []byte) io.Reader { return bytes.NewReader(b) }

// pastHeader fails the test's reader if ReadHead reads beyond what it was given.
type pastHeader struct{}

func (pastHeader) Read([]byte) (int, error) { return 0, errors.New("read past the header") }

type HeadSuite struct{ suite.Suite }

func TestHeadSuite(t *testing.T) { suite.Run(t, new(HeadSuite)) }

func (s *HeadSuite) TestReadsJSONAndBinPosition() {
	doc, bin := triangleDoc()
	glb := makeGLB(s.T(), doc, bin)

	h, err := ReadHead(bytes.NewReader(glb))

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(h.Doc.Meshes), 1)
	paddedJSON := int64(binary.LittleEndian.Uint32(glb[12:16]))
	assert.Equal(s.T(), h.BinOffset, 20+paddedJSON+8)
	assert.Equal(s.T(), h.BinLength, int64(44))
	assert.DeepEqual(s.T(), glb[h.BinOffset:h.BinOffset+42], bin)
}

func (s *HeadSuite) TestJSONOnlyHasNoBin() {
	doc, _ := triangleDoc()
	doc.Buffers = nil

	h, err := ReadHead(bytes.NewReader(makeGLB(s.T(), doc, nil)))

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), h.BinLength, int64(0))
}

func (s *HeadSuite) TestRejects() {
	doc, bin := triangleDoc()
	good := makeGLB(s.T(), doc, bin)
	with := func(edit func(b []byte)) []byte {
		b := bytes.Clone(good)
		edit(b)
		return b
	}
	tooBig := binary.LittleEndian.AppendUint32(bytes.Clone(good[:12]), 64<<20+1)
	tooBig = binary.LittleEndian.AppendUint32(tooBig, 0x4E4F534A)

	cases := []struct {
		name string
		in   io.Reader
	}{
		{"bad magic", bytes.NewReader(with(func(b []byte) { b[0] = 'x' }))},
		{"version 1", bytes.NewReader(with(func(b []byte) { b[4] = 1 }))},
		{"first chunk is not JSON", bytes.NewReader(with(func(b []byte) { b[16] = 'X' }))},
		{"truncated header", bytes.NewReader(good[:8])},
		{"truncated JSON", bytes.NewReader(good[:30])},
		{"not JSON", bytes.NewReader(makeGLBText(s.T(), "not json"))},
		{"JSON chunk over the cap is refused before it is read", io.MultiReader(bytes.NewReader(tooBig), pastHeader{})},
		{"BIN chunk header cut short", bytes.NewReader(good[:len(good)-len(binOf(44, 0))-4])},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			_, err := ReadHead(tc.in)
			assert.ErrorIs(s.T(), err, ErrMalformed)
		})
	}
}

// makeGLBText frames raw JSON text, which makeGLB cannot (it marshals a document).
func makeGLBText(t *testing.T, text string) []byte {
	t.Helper()
	js := padTo4([]byte(text), ' ')
	out := binary.LittleEndian.AppendUint32(nil, 0x46546C67)
	out = binary.LittleEndian.AppendUint32(out, 2)
	out = binary.LittleEndian.AppendUint32(out, uint32(20+len(js)))
	out = binary.LittleEndian.AppendUint32(out, uint32(len(js)))
	out = binary.LittleEndian.AppendUint32(out, 0x4E4F534A)
	return append(out, js...)
}
