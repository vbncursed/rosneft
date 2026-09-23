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

// pngHeader is a PNG signature plus a valid IHDR and nothing else. That is all
// DecodeConfig reads, so it can claim any size without the bytes existing.
func pngHeader(w, h uint32) []byte {
	ihdr := binary.BigEndian.AppendUint32(nil, w)
	ihdr = binary.BigEndian.AppendUint32(ihdr, h)
	ihdr = append(ihdr, 8, 0, 0, 0, 0) // 8-bit greyscale, deflate, no filter, no interlace
	chunk := append([]byte("IHDR"), ihdr...)
	out := []byte("\x89PNG\r\n\x1a\n")
	out = binary.BigEndian.AppendUint32(out, uint32(len(ihdr)))
	out = append(out, chunk...)
	return binary.BigEndian.AppendUint32(out, crc32.ChecksumIEEE(chunk))
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
		name string
		w, h uint32
	}{
		{"too wide", thumbnail.MaxWidth + 1, 1},
		{"too tall", 1, thumbnail.MaxHeight + 1},
		{"a bomb", 100_000, 100_000},
		{"within both sides but over the area", 8192, 4097},
		{"the sides' own maximum", thumbnail.MaxWidth, thumbnail.MaxHeight},
	} {
		s.Run(tc.name, func() {
			_, err := thumbnail.Make(s.T().Context(), s.store, s.put(pngHeader(tc.w, tc.h)))
			assert.ErrorIs(s.T(), err, domain.ErrImageTooLarge)
		})
	}
}

// A header exactly at the area budget passes the guard, so the decode runs and
// fails on the missing pixel data instead.
func (s *MakeSuite) TestLetsASourceExactlyAtTheAreaBudgetThroughTheGuard() {
	for _, tc := range []struct {
		name string
		w, h uint32
	}{
		{"8192×4096", 8192, 4096},
		{"a full-width strip", thumbnail.MaxWidth, thumbnail.MaxPixels / thumbnail.MaxWidth},
	} {
		s.Run(tc.name, func() {
			_, err := thumbnail.Make(s.T().Context(), s.store, s.put(pngHeader(tc.w, tc.h)))
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

func (s *MakeSuite) TestRefusesWhatIsNotAnImage() {
	_, err := thumbnail.Make(s.T().Context(), s.store, s.put([]byte("%PDF-1.7 not an image")))
	assert.ErrorIs(s.T(), err, image.ErrFormat)
}

func (s *MakeSuite) TestReportsAMissingSource() {
	_, err := thumbnail.Make(s.T().Context(), s.store, "ab"+string(bytes.Repeat([]byte("0"), 62)))
	assert.ErrorIs(s.T(), err, blobstore.ErrNotFound)
}
