package thumbnail_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/thumbnail"
)

// MakeSuite runs Make against a real FS store in a temp dir: the blob layout
// and the content addressing are part of what is being tested.
type MakeSuite struct {
	suite.Suite
	store *blobstore.FS
}

func TestMakeSuite(t *testing.T) { suite.Run(t, new(MakeSuite)) }

func (s *MakeSuite) SetupTest() {
	store, err := blobstore.NewFS(s.T().TempDir())
	assert.NilError(s.T(), err)
	s.store = store
}

// put stores b under its own sha256, as upload-service does.
func (s *MakeSuite) put(b []byte) string {
	sum := sha256.Sum256(b)
	hash := hex.EncodeToString(sum[:])
	_, err := s.store.Put(s.T().Context(), hash, "application/octet-stream", bytes.NewReader(b))
	assert.NilError(s.T(), err)
	return hash
}

func gradient(w, h int) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			img.Set(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: 128, A: 255})
		}
	}
	return img
}

// PNG colour types and bit depths the guard tells apart.
const (
	pngGray = 0
	pngRGBA = 6
)

// pngHeader is a PNG signature plus a valid IHDR and nothing else. That is all
// DecodeConfig reads, so it can claim any size without the bytes existing.
func pngHeader(w, h uint32, depth, colorType byte) []byte {
	ihdr := binary.BigEndian.AppendUint32(nil, w)
	ihdr = binary.BigEndian.AppendUint32(ihdr, h)
	ihdr = append(ihdr, depth, colorType, 0, 0, 0) // deflate, no filter, no interlace
	chunk := append([]byte("IHDR"), ihdr...)
	out := []byte("\x89PNG\r\n\x1a\n")
	out = binary.BigEndian.AppendUint32(out, uint32(len(ihdr)))
	out = append(out, chunk...)
	return binary.BigEndian.AppendUint32(out, crc32.ChecksumIEEE(chunk))
}

// JPEG start-of-frame markers: baseline and progressive.
const (
	sof0 = 0xC0
	sof2 = 0xC2
)

// jpegHeader is SOI, a JFIF APP0, the given extra segments and a 4:4:4 YCbCr
// SOF. With JFIF present DecodeConfig stops at the SOF, so it can claim any
// size without the bytes existing.
func jpegHeader(w, h uint16, sof byte, extra ...[]byte) []byte {
	out := []byte{0xFF, 0xD8}
	out = append(out, segment(0xE0, []byte("JFIF\x00\x01\x02\x00\x00\x01\x00\x01\x00\x00"))...)
	for _, e := range extra {
		out = append(out, e...)
	}
	frame := []byte{8}
	frame = binary.BigEndian.AppendUint16(frame, h)
	frame = binary.BigEndian.AppendUint16(frame, w)
	frame = append(frame, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0)
	return append(out, segment(sof, frame)...)
}

func segment(marker byte, payload []byte) []byte {
	out := binary.BigEndian.AppendUint16([]byte{0xFF, marker}, uint16(len(payload)+2))
	return append(out, payload...)
}

func (s *MakeSuite) TestScalesJPEGAndPNGDownToAStoredJPEG() {
	for _, tc := range []struct {
		name   string
		encode func(io.Writer, image.Image) error
	}{
		{"jpeg", func(w io.Writer, m image.Image) error { return jpeg.Encode(w, m, nil) }},
		{"png", png.Encode},
	} {
		s.Run(tc.name, func() {
			var src bytes.Buffer
			assert.NilError(s.T(), tc.encode(&src, gradient(512, 256)))

			hash, err := thumbnail.Make(s.T().Context(), s.store, s.put(src.Bytes()))
			assert.NilError(s.T(), err)

			rc, blob, err := s.store.Get(s.T().Context(), hash)
			assert.NilError(s.T(), err)
			defer func() { _ = rc.Close() }()
			body, err := io.ReadAll(rc)
			assert.NilError(s.T(), err)
			sum := sha256.Sum256(body)
			assert.Equal(s.T(), hash, hex.EncodeToString(sum[:]), "content-addressed like every other blob")
			assert.Equal(s.T(), blob.ContentType, "image/jpeg")

			cfg, format, err := image.DecodeConfig(bytes.NewReader(body))
			assert.NilError(s.T(), err)
			assert.Equal(s.T(), format, "jpeg")
			assert.Equal(s.T(), cfg.Width, thumbnail.Width)
			assert.Equal(s.T(), cfg.Height, thumbnail.Height)
		})
	}
}

// The backfill retries a row on every boot, so a rerun must land on the same key.
func (s *MakeSuite) TestARerunWritesTheSameBlob() {
	var src bytes.Buffer
	assert.NilError(s.T(), jpeg.Encode(&src, gradient(512, 256), nil))
	srcHash := s.put(src.Bytes())

	first, err := thumbnail.Make(s.T().Context(), s.store, srcHash)
	assert.NilError(s.T(), err)
	second, err := thumbnail.Make(s.T().Context(), s.store, srcHash)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), first, second)
}

// The header alone is refused. If the guard slipped, Decode would try to
// allocate the claimed image.
func (s *MakeSuite) TestRefusesASourceWhoseHeaderIsOverTheLimit() {
	for _, tc := range []struct {
		name   string
		header []byte
	}{
		{"too wide", pngHeader(thumbnail.MaxWidth+1, 1, 8, pngGray)},
		{"too tall", pngHeader(1, thumbnail.MaxHeight+1, 8, pngGray)},
		{"a bomb", pngHeader(100_000, 100_000, 8, pngGray)},
		{"16-bit RGBA PNG at the sides' maximum, 8 B/px", pngHeader(thumbnail.MaxWidth, thumbnail.MaxHeight, 16, pngRGBA)},
		{"progressive JPEG 11968×5984, 15 B/px", jpegHeader(11968, 5984, sof2)},
	} {
		s.Run(tc.name, func() {
			_, err := thumbnail.Make(s.T().Context(), s.store, s.put(tc.header))
			assert.ErrorIs(s.T(), err, domain.ErrImageTooLarge)
		})
	}
}

// A header within the memory budget passes the guard, so the decode runs and
// fails on the missing pixel data instead.
func (s *MakeSuite) TestLetsASourceWithinTheDecodeBudgetThroughTheGuard() {
	// An APP1 whose payload holds the bytes of an SOF2 marker, as an EXIF
	// thumbnail's can: only the frame's own marker may count.
	sof2InPayload := segment(0xE1, []byte{'E', 'x', 'i', 'f', 0, 0, 0xFF, sof2, 0, 0x11})
	for _, tc := range []struct {
		name   string
		header []byte
	}{
		{"baseline JPEG 11968×5984, 3 B/px", jpegHeader(11968, 5984, sof0)},
		{"baseline JPEG with SOF2 bytes inside an APP1", jpegHeader(11968, 5984, sof0, sof2InPayload)},
		{"8-bit RGBA PNG 8192×8192, 4 B/px", pngHeader(8192, 8192, 8, pngRGBA)},
		{"8-bit grey PNG at the sides' maximum, 1 B/px", pngHeader(thumbnail.MaxWidth, thumbnail.MaxHeight, 8, pngGray)},
	} {
		s.Run(tc.name, func() {
			_, err := thumbnail.Make(s.T().Context(), s.store, s.put(tc.header))
			assert.ErrorIs(s.T(), err, io.ErrUnexpectedEOF)
		})
	}
}

// gatedStore holds Make inside its decode slot until release is closed, and
// says so on entered.
type gatedStore struct {
	*blobstore.FS
	entered chan struct{}
	release chan struct{}
}

func (g gatedStore) Get(ctx context.Context, hash string) (io.ReadCloser, blobstore.Blob, error) {
	close(g.entered)
	<-g.release
	return g.FS.Get(ctx, hash)
}

// A create waiting behind the backfill's decode must give up when its request does.
func (s *MakeSuite) TestAWaitForTheDecodeSlotHonoursCancellation() {
	var src bytes.Buffer
	assert.NilError(s.T(), jpeg.Encode(&src, gradient(512, 256), nil))
	srcHash := s.put(src.Bytes())

	gated := gatedStore{FS: s.store, entered: make(chan struct{}), release: make(chan struct{})}
	held := make(chan error, 1)
	go func() {
		_, err := thumbnail.Make(s.T().Context(), gated, srcHash)
		held <- err
	}()
	<-gated.entered

	ctx, cancel := context.WithCancel(s.T().Context())
	cancel()
	start := time.Now()
	_, err := thumbnail.Make(ctx, s.store, srcHash)
	assert.ErrorIs(s.T(), err, context.Canceled)
	assert.Assert(s.T(), time.Since(start) < time.Second, "returned without waiting for the slot")

	close(gated.release)
	assert.NilError(s.T(), <-held)
}

// cancellingStore cancels the request as Make fetches the source, and counts
// the source bytes anything reads after that.
type cancellingStore struct {
	*blobstore.FS
	cancel context.CancelFunc
	read   *int
}

func (c cancellingStore) Get(ctx context.Context, hash string) (io.ReadCloser, blobstore.Blob, error) {
	rc, blob, err := c.FS.Get(ctx, hash)
	c.cancel()
	return countingReader{ReadCloser: rc, read: c.read}, blob, err
}

type countingReader struct {
	io.ReadCloser
	read *int
}

func (c countingReader) Read(p []byte) (int, error) {
	n, err := c.ReadCloser.Read(p)
	*c.read += n
	return n, err
}

// A request cancelled while the source is being opened must not pay for the
// decode: the check sits between Get and the first read.
func (s *MakeSuite) TestACancelledRequestSkipsTheDecode() {
	var src bytes.Buffer
	assert.NilError(s.T(), jpeg.Encode(&src, gradient(512, 256), nil))
	srcHash := s.put(src.Bytes())

	ctx, cancel := context.WithCancel(s.T().Context())
	read := 0
	_, err := thumbnail.Make(ctx, cancellingStore{FS: s.store, cancel: cancel, read: &read}, srcHash)
	assert.ErrorIs(s.T(), err, context.Canceled)
	assert.Equal(s.T(), read, 0, "the source was not read")
}

func (s *MakeSuite) TestRefusesWhatIsNotAnImage() {
	_, err := thumbnail.Make(s.T().Context(), s.store, s.put([]byte("%PDF-1.7 not an image")))
	assert.ErrorIs(s.T(), err, image.ErrFormat)
}

func (s *MakeSuite) TestReportsAMissingSource() {
	_, err := thumbnail.Make(s.T().Context(), s.store, "ab"+string(bytes.Repeat([]byte("0"), 62)))
	assert.ErrorIs(s.T(), err, blobstore.ErrNotFound)
}
