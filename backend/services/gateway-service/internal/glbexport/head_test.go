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

// glbHead is the 20 bytes ReadHead needs first: magic, version, length, then
// the first chunk's length and type.
func glbHead(magic, version, jsonLen, chunkType uint32) []byte {
	var b []byte
	for _, v := range []uint32{magic, version, 0, jsonLen, chunkType} {
		b = binary.LittleEndian.AppendUint32(b, v)
	}
	return b
}

const (
	testMagic = 0x46546C67
	testJSON  = 0x4E4F534A
)

// Every refusal carries its own reason; the order of the checks is the order
// of the cases that fail on two counts at once.
func (s *HeadSuite) TestRejectionMessages() {
	doc, bin := triangleDoc()
	good := makeGLB(s.T(), doc, bin)
	jsonLen := binary.LittleEndian.Uint32(good[12:16])
	binHeaderAt := 20 + int(jsonLen)
	cases := []struct {
		name string
		in   io.Reader
		want string
	}{
		{"empty input", bytes.NewReader(nil), "glbexport: malformed glb: header: EOF"},
		{"header cut short", bytes.NewReader(good[:19]), "glbexport: malformed glb: header: unexpected EOF"},
		{"bad magic", bytes.NewReader(glbHead(1, 2, 4, testJSON)), "glbexport: malformed glb: bad magic"},
		{
			"magic is checked before version",
			bytes.NewReader(glbHead(1, 1, 4, testJSON)),
			"glbexport: malformed glb: bad magic",
		},
		{"version 1", bytes.NewReader(glbHead(testMagic, 1, 4, testJSON)), "glbexport: malformed glb: version 1"},
		{
			"version is checked before the chunk type",
			bytes.NewReader(glbHead(testMagic, 3, 4, 7)),
			"glbexport: malformed glb: version 3",
		},
		{
			"chunk type is checked before the cap",
			bytes.NewReader(glbHead(testMagic, 2, 64<<20+1, 7)),
			"glbexport: malformed glb: first chunk is not JSON",
		},
		{
			"over the cap by one byte",
			io.MultiReader(bytes.NewReader(glbHead(testMagic, 2, 64<<20+1, testJSON)), pastHeader{}),
			"glbexport: malformed glb: JSON chunk of 67108865 bytes",
		},
		{
			"at the cap the chunk is read, and missing",
			bytes.NewReader(glbHead(testMagic, 2, 64<<20, testJSON)),
			"glbexport: malformed glb: JSON chunk: EOF",
		},
		{"JSON cut short", bytes.NewReader(good[:30]), "glbexport: malformed glb: JSON chunk: unexpected EOF"},
		{
			"JSON that does not parse",
			bytes.NewReader(makeGLBText(s.T(), "not json")),
			"glbexport: malformed glb: JSON chunk: invalid character 'o' in literal null (expecting 'u')",
		},
		{
			"second chunk header cut short",
			bytes.NewReader(good[:binHeaderAt+5]),
			"glbexport: malformed glb: second chunk header: unexpected EOF",
		},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			_, err := ReadHead(tc.in)

			assert.ErrorIs(s.T(), err, ErrMalformed)
			assert.Error(s.T(), err, tc.want)
		})
	}
}

// A BIN chunk header is the last thing read: nothing of the BIN data is.
func (s *HeadSuite) TestStopsAfterTheBinChunkHeader() {
	doc, bin := triangleDoc()
	good := makeGLB(s.T(), doc, bin)
	binHeaderEnd := 20 + int(binary.LittleEndian.Uint32(good[12:16])) + 8

	h, err := ReadHead(io.MultiReader(bytes.NewReader(good[:binHeaderEnd]), pastHeader{}))

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), h.BinOffset, int64(binHeaderEnd))
	assert.Equal(s.T(), h.BinLength, int64(44))
}

// Only a BIN chunk gives a position; any other second chunk is ignored.
func (s *HeadSuite) TestSecondChunkOfAnotherTypeIsNoBin() {
	doc, bin := triangleDoc()
	good := bytes.Clone(makeGLB(s.T(), doc, bin))
	binHeaderAt := 20 + int(binary.LittleEndian.Uint32(good[12:16]))
	good[binHeaderAt+4] = 'X'

	h, err := ReadHead(bytes.NewReader(good))

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), h.BinOffset, int64(0))
	assert.Equal(s.T(), h.BinLength, int64(0))
	assert.Equal(s.T(), len(h.Doc.Meshes), 1)
}
