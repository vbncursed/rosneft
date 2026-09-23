// Package thumbnail makes the small JPEG the View tab shows for a panorama,
// so a 44×34 row never downloads and decodes the whole equirect.
package thumbnail

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/png" // a panorama source is a JPEG or a PNG (the SPA sniffs both)
	"io"

	"golang.org/x/image/draw"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// Width and Height are the thumbnail's size. The source is an equirect, 2:1.
const (
	Width  = 256
	Height = 128
)

// MaxDecodeBytes is the decode budget: the memory the stdlib decoder will
// allocate, estimated from the header (decodeBytes) before any of it is. The
// budget is memory, not area, because the bytes per pixel differ fivefold
// between a baseline and a progressive JPEG of the same size. MaxWidth and
// MaxHeight still bound each side; with them the estimate cannot overflow.
//
// Bytes per pixel, as image/jpeg and image/png allocate them:
//   - JPEG, c components (grey 1, YCbCr/RGB 3, CMYK/YCCK 4): c for the decoded
//     planes; +4 for an RGB or CMYK stream, which is converted into a second
//     4 B/px image after the decode; and, if progressive (SOF2), +4c for the
//     [64]int32 coefficient block per 8×8 of each component, kept between scans
//   - PNG: RGBA64/NRGBA64 8, RGBA/NRGBA 4, Gray16 2, Gray and paletted 1,
//     anything else 8
//
// So 11968×5984 (the largest source in prod), baseline YCbCr: ~215 MB, passes;
// the same size progressive: ~1.07 GB, refused. The worst case, progressive
// CMYK at 24 B/px, is admitted up to ~33.5 M px.
const (
	MaxWidth       = 16384
	MaxHeight      = 8192
	MaxDecodeBytes = 768 << 20
)

const quality = 80

// decoding is a one-slot semaphore that serialises Make. Without it, a create
// racing the backfill, or two creates, would each hold a decode's peak
// memory (see MaxDecodeBytes). It is a channel rather than a mutex so that a create
// waiting behind the backfill gives up when its request is cancelled.
// ponytail: one decode per process; a semaphore of N if uploads ever queue.
var decoding = make(chan struct{}, 1)

// Make decodes the image blob srcHash and scales it to Width×Height. It stores
// the result as a JPEG and returns the hash, which is the lowercase sha256 hex
// of the JPEG bytes: the addressing upload-service and mesh-worker use. A rerun
// therefore rewrites the same blob instead of adding another.
func Make(ctx context.Context, store blobstore.Store, srcHash string) (string, error) {
	select {
	case decoding <- struct{}{}:
	case <-ctx.Done():
		return "", ctx.Err()
	}
	defer func() { <-decoding }()

	src, err := decode(ctx, store, srcHash)
	if err != nil {
		return "", err
	}
	dst := image.NewRGBA(image.Rect(0, 0, Width, Height))
	draw.BiLinear.Scale(dst, dst.Bounds(), src, src.Bounds(), draw.Src, nil)

	var out bytes.Buffer
	if err := jpeg.Encode(&out, dst, &jpeg.Options{Quality: quality}); err != nil {
		return "", fmt.Errorf("thumbnail: encode: %w", err)
	}
	sum := sha256.Sum256(out.Bytes())
	hash := hex.EncodeToString(sum[:])
	if _, err := store.Put(ctx, hash, "image/jpeg", &out); err != nil {
		return "", fmt.Errorf("thumbnail: put: %w", err)
	}
	return hash, nil
}

// decode reads the header through a tee and checks the size. It then decodes
// the image from the teed bytes followed by the rest of the stream, so the blob
// is opened once and read once.
func decode(ctx context.Context, store blobstore.Store, hash string) (image.Image, error) {
	rc, _, err := store.Get(ctx, hash)
	if err != nil {
		return nil, fmt.Errorf("thumbnail: get source: %w", err)
	}
	defer func() { _ = rc.Close() }()
	// Get may have waited on a slow disk; a request gone by now must not pay
	// for the decode.
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	var head bytes.Buffer
	cfg, format, err := image.DecodeConfig(io.TeeReader(rc, &head))
	if err != nil {
		return nil, fmt.Errorf("thumbnail: read header: %w", err)
	}
	// The sides are checked first, so the estimate cannot overflow.
	if cfg.Width > MaxWidth || cfg.Height > MaxHeight || decodeBytes(cfg, format, head.Bytes()) > MaxDecodeBytes {
		return nil, fmt.Errorf("thumbnail: %w: %d×%d", domain.ErrImageTooLarge, cfg.Width, cfg.Height)
	}
	img, _, err := image.Decode(io.MultiReader(&head, rc))
	if err != nil {
		return nil, fmt.Errorf("thumbnail: decode: %w", err)
	}
	return img, nil
}

// decodeBytes estimates the memory decoding the image will allocate, from its
// config and the header bytes DecodeConfig read. See MaxDecodeBytes.
func decodeBytes(cfg image.Config, format string, head []byte) int {
	pixels := cfg.Width * cfg.Height
	if format != "jpeg" {
		return pixels * pngBytesPerPixel(cfg.ColorModel)
	}
	components, converted := 3, 0
	switch cfg.ColorModel {
	case color.GrayModel:
		components = 1
	case color.RGBAModel:
		converted = 4
	case color.CMYKModel:
		components, converted = 4, 4
	}
	perPixel := components + converted
	if jpegProgressive(head) {
		perPixel += 4 * components
	}
	return pixels * perPixel
}

func pngBytesPerPixel(m color.Model) int {
	if _, ok := m.(color.Palette); ok {
		return 1
	}
	switch m {
	case color.GrayModel:
		return 1
	case color.Gray16Model:
		return 2
	case color.RGBAModel, color.NRGBAModel:
		return 4
	default:
		return 8
	}
}

// jpegProgressive reports whether the frame is progressive (SOF2). It walks
// the marker segments rather than searching for the marker's bytes, which an
// APP segment's payload (an EXIF thumbnail, say) or a table can hold. A header
// it cannot walk to the frame counts as progressive, the costlier case.
func jpegProgressive(head []byte) bool {
	const sof0, sof1, sof2 = 0xC0, 0xC1, 0xC2
	i := 2 // past SOI
	for i+1 < len(head) {
		if head[i] != 0xFF {
			i++ // extraneous data, which image/jpeg skips too
			continue
		}
		marker := head[i+1]
		switch {
		case marker == 0xFF: // a fill byte
			i++
		case marker == 0x00, 0xD0 <= marker && marker <= 0xD7: // stuffing, RSTn: no length
			i += 2
		case marker == sof0, marker == sof1, marker == sof2:
			return marker == sof2
		case i+3 < len(head):
			i += 2 + int(head[i+2])<<8 + int(head[i+3])
		default:
			return true
		}
	}
	return true
}
