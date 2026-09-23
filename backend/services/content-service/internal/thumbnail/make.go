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

// MaxPixels is the decode budget. Make reads the header first and refuses a
// larger image before any of it is allocated. The budget is an area, not a
// pair of sides, because a decode's memory grows with the pixel count. The side
// limits alone let 16384×8192 through, which is four times this area. At that
// size a few-MB progressive JPEG could make the decoder use about 2.7 GB.
//
// Peak memory at MaxPixels (33.5 M px):
//   - progressive CMYK JPEG, 20 B/px (4 coefficient planes of 4 B, plus the image): ~0.67 GB, the worst case
//   - progressive 4:4:4 JPEG, 15 B/px (3 planes of 4 B, plus the image): ~0.50 GB
//   - 16-bit RGBA PNG, 8 B/px (image.RGBA64): ~0.27 GB
//   - baseline 4:4:4 JPEG, 3 B/px: ~0.10 GB
//
// MaxWidth and MaxHeight still bound each side, so a full-width strip is fine
// but a full 16384×8192 source is not.
const (
	MaxWidth  = 16384
	MaxHeight = 8192
	MaxPixels = 8192 * 4096
)

const quality = 80

// decoding is a one-slot semaphore that serialises Make. Without it, a create
// racing the backfill, or two creates, would each hold a decode's peak
// memory (see MaxPixels). It is a channel rather than a mutex so that a create
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
	draw.ApproxBiLinear.Scale(dst, dst.Bounds(), src, src.Bounds(), draw.Src, nil)

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

	var head bytes.Buffer
	cfg, _, err := image.DecodeConfig(io.TeeReader(rc, &head))
	if err != nil {
		return nil, fmt.Errorf("thumbnail: read header: %w", err)
	}
	// The sides are checked first, so the product cannot overflow.
	if cfg.Width > MaxWidth || cfg.Height > MaxHeight || cfg.Width*cfg.Height > MaxPixels {
		return nil, fmt.Errorf("thumbnail: %w: %d×%d", domain.ErrImageTooLarge, cfg.Width, cfg.Height)
	}
	img, _, err := image.Decode(io.MultiReader(&head, rc))
	if err != nil {
		return nil, fmt.Errorf("thumbnail: decode: %w", err)
	}
	return img, nil
}
